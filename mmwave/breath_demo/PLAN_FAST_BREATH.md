# Plan: faster, cleaner breath signal

Two paths, sequenced. Path B is small, low-risk, and probably enough. Path C is
the nuclear option and contains real unknowns. **Do B first.** If B's output
looks and feels good in the synth demo, stop. If not, escalate to C.

---

## Path B — integrate `total_phase` and band-pass it (host-side)

### Goal

Replace the current slew-limiter + 1-pole low-pass with:

1. running integration of `total_phase` (the per-frame Δφ the firmware ships)
   into a continuous phase signal `φ`,
2. a 2nd-order Butterworth band-pass (≈ 0.1 – 0.5 Hz) that strips out DC drift
   and out-of-band noise, leaving a true breath waveform.

Expected outcome: a signal that looks more like a breathing curve than a
phase-velocity wiggle, with ≈ 0.5 – 1 s group delay (vs. the firmware's ≈ 5 s).

### Why first

| Risk | Status |
|---|---|
| Protocol unknowns | None — we already receive `total_phase` reliably. |
| Hardware risk | None — pure math on existing data. |
| Bandwidth | None — same UART traffic as today. |
| Reversibility | Trivial — keep both topics live, A/B in the browser. |
| Time to first result | ~30 minutes if the simulator agrees. |

### Steps

#### B1. Dry-run the filter in Python on existing captures

The repo already has 6000 frames of capture data in `captures/*.csv`. Before
touching firmware, replay them through the proposed integrate-then-band-pass
pipeline in Python and plot the result against the raw `total_phase` and the
existing `smooth_fast_breath`.

Key things to learn from the dry-run:
- Does integrating `total_phase` actually produce a sensible-looking phase
  trace, or does it drift / saturate?
- What cut-off frequencies actually look best on real captures?
- Is the band-pass adequate, or do we need a separate slow detrend stage?
- How long is the start-up transient? (Settling time of a Butterworth
  band-pass is roughly 2-3 cycles of the lowest passband edge — about 6 s for
  0.1 Hz. Acceptable for a session-based demo.)

A small `tools/breath_filter_dryrun.py` script that loads a capture, applies
the filter, and writes a side-by-side PNG is the right artefact. It also
becomes the "regression test" — when we tune coefficients later, we re-run
it and compare.

#### B2. Compute the actual coefficients you want

The cookbook coefficients I gave (`b = {0.06745, 0, -0.06745}`,
`a = {-1.84477, 0.86510}`) are starting values. Use scipy in Python to
generate your own for whatever cut-offs the dry-run reveals as best:

```python
from scipy.signal import butter
b, a = butter(N=2, Wn=[0.1, 0.5], btype='band', fs=20)
# scipy returns 4th-order overall (2 sections); cascade them as biquads
# or use sosfilt for stability.
```

For a single-biquad implementation (cheap, smaller, fine for a demo), use the
RBJ cookbook bandpass with `Q = sqrt(f1·f2) / (f2 - f1)` (≈ 0.56 for
0.1–0.5 Hz), centered at `sqrt(f1·f2)`. Document whichever you choose in a
header comment; future-you will thank present-you.

#### B3. Implement on the ESP32

Add to `breath_demo.ino`:

```cpp
// ---------- Integrate-then-bandpass breath path ----------
// Coefficients: 2nd-order Butterworth bandpass 0.1-0.5 Hz at Fs=20 Hz.
// Verified by tools/breath_filter_dryrun.py on captures/20260508-capture-*.csv.
const float BP_B[3] = { /* fill from B2 */ };
const float BP_A[2] = { /* fill from B2 */ };

float phase_int = 0.0f;       // running phase integrator
float bp_s1 = 0.0f, bp_s2 = 0.0f;   // Direct-Form-II Transposed state

float bandpass_breath(float total_phase) {
  phase_int += total_phase;            // φ accumulates Δφ
  // Optional leaky-integrator term — see "drift" note below.

  // Direct-Form-II Transposed biquad.
  float y = BP_B[0] * phase_int + bp_s1;
  bp_s1   = BP_B[1] * phase_int - BP_A[0] * y + bp_s2;
  bp_s2   = BP_B[2] * phase_int - BP_A[1] * y;
  return y;
}
```

Publish the new value on a *new* MQTT topic in parallel with the existing one:

```cpp
publishFloat("hands/mmwave/smooth_fast_breath", smooth_fast_breath);  // old
publishFloat("hands/mmwave/breath_band",        bandpass_breath(total_phase));
```

Keeping both topics live during evaluation is important — it lets you A/B in
the browser without re-flashing.

#### B4. Drift mitigation (only if needed)

The integrator `phase_int += total_phase` will grow without bound. Float32
gives 7 decimal digits of precision; at 20 Hz with typical Δφ ≈ 0.1 rad/frame
the integrator hits ≈ 7200 rad/hour, which is fine for an evening session
but degrades after a few hours.

The band-pass already kills DC and very low frequencies, so static drift in
`phase_int` doesn't appear at the output. The risk is precision loss, not
amplitude leak. Two simple guards:

- **Periodic reset**: if `|phase_int| > 1e6f`, subtract its current value
  from itself and from all biquad state. Invisible at the output if done at a
  zero-crossing.
- **Leaky integrator**: replace `phase_int += total_phase` with
  `phase_int = 0.999f * phase_int + total_phase`. Time constant ≈ 50 s,
  comfortably outside the 0.1–0.5 Hz passband.

Don't pre-emptively add either of these. Add only if the dry-run shows the
issue, or if a session past an hour shows visible degradation.

#### B5. Update the browser

Update `index.html` to subscribe to both topics, and add a hotkey or button to
toggle which one drives the synth. Capture A/B notes for an evening of testing.

#### B6. Decide

If B5's evaluation says "this is alive enough for the demo," ship it. Make
`hands/mmwave/breath_band` canonical, retire the slew + low-pass path, update
`README.md` and `mmwave_explainer.html` to reflect the new pipeline.

If it isn't alive enough — if the band-pass's start-up transient annoys you,
or if a 0.5 s lag is too much for the synth — proceed to Path C.

### Open questions (none of which block B1)

- The Seeed library labels the first float of `0x0A13` as `total_phase`, but
  the Ghidra agent suggests it's actually Δφ. The dry-run will resolve this:
  if `cumsum(total_phase)` looks like a continuous chest-position curve,
  then the label is misleading and Δφ is what's actually shipped. If
  `cumsum(cumsum(...))` is what looks like chest position, then the label is
  correct and we have ourselves an over-integration problem. (The first
  case is the agent's prediction.)

---

## Path C — raw range-Doppler mode (ambitious)

### Goal

Bypass *all* firmware filtering. Switch the radar to its alternate raw-output
mode (host→device command `0x0A14`), receive the range-Doppler matrices it
emits on `0x0A32` and `0x0A34`, and run the entire pipeline (range-bin pick →
phase extract → unwrap → band-pass) on the host. Theoretical floor on
end-to-end latency: a few hundred milliseconds.

### Why later

| Risk | Status |
|---|---|
| Mode-switch command works | Inferred from disassembly. Not verified on real hardware. |
| Frame layout of `0x0A32` / `0x0A34` | Unknown. 1024 bytes / antenna; the agent didn't decode the layout. |
| UART bandwidth | Naïve estimate is 40 kB/s, which exceeds 115 200 baud (~11.5 kB/s). Likely needs baud-rate change or per-frame downsampling. |
| Whether the radar continues breath/heart frames in raw mode | Uncertain — agent saw `0x0A14` set the mode flag but didn't trace what gets emitted afterwards. |
| Implementation effort | Easily 5-10× Path B. |

### Phases

#### C1. Reconnaissance: does raw mode even respond?

Smallest possible experiment that proves the mode switch is real.

1. Add a one-off function to the .ino that builds a host→device frame with
   command ID `0x0A14`, no payload (or a 1-byte sentinel; the agent saw
   "control / configure" patterns). Send it once at boot, after MQTT connect.
2. Stop calling `mmWave.update()` for parsing; instead, dump every byte
   arriving on the radar UART to `Serial.write` (the USB serial), framed as
   hex.
3. Capture 30 seconds of dump from a host terminal (`screen` or `pyserial`).
4. Search the dump for byte patterns matching `0x32 0x0A` and `0x34 0x0A`
   (the protocol is big-endian 16-bit type codes, so the bytes appear as
   "type_hi type_lo" = `0A 32` after the header in the on-wire layout — the
   exact prefix depends on how the agent's reading of the framing matches the
   library's).
5. After capture, send `0x0A15` to revert. Confirm normal frames return.

**Stop criteria for C1**:
- If no new frames appear after `0x0A14` is sent → the host→device command
  isn't accepted, or it requires a different payload, or the firmware ignores
  the request silently. Dig further with Ghidra (we'd need the `dispatch`
  function around `0x7CF4` to confirm the host command parser). At that point
  the project budget for C is much higher than originally estimated.
- If new high-rate frames appear → proceed to C2. Save the dump.

#### C2. Decode `0x0A32` / `0x0A34` byte layout

Empirical reverse-engineering. With raw mode confirmed:

1. Set up a known-static scene (radar pointed at an empty wall, nothing
   moving). Capture 5 seconds.
2. Move a single hand into the scene, ~50 cm away. Capture 5 seconds.
3. Compare the two captures, frame by frame, looking for cells whose values
   change. Those cells correspond to the moving target's range/Doppler bin.
4. Combined with the disassembly's "256 ranges × 32 Doppler" matrix shape,
   deduce the layout. Likely candidates for 1024 bytes:
   - 32 Doppler × 16 range, complex int16 (4 bytes per cell): 32×16×4 = 2048
     bytes — too big, so probably not this.
   - 32 Doppler × 16 range, real int16 (magnitude or magnitude²): 32×16×2 =
     1024 bytes. **Most likely**.
   - 64 Doppler × 8 range, real int16: 64×8×2 = 1024 bytes.
   - Some other crop.
5. The two streams (`0x0A32`, `0x0A34`) are presumably two of the four
   antennas. Decide whether you need both. If not, ignore one.

#### C3. Bandwidth budget

Two 1024-byte frames per 50 ms = 40 KB/s. Plus framing overhead = ≈ 50 KB/s.
At 115 200 baud (effective ~10 KB/s), the UART overflows immediately.

Three possible mitigations:

a) **Downsample at the host**: process every Nth frame, drop the rest. Reduces
   effective frame rate to ≈ 4 Hz for a clean 4× headroom. Acceptable for
   breath (which only needs 2 Hz Nyquist), wrong for heart (which needs ≥ 4
   Hz Nyquist). If you only care about breath, this is fine.

b) **Raise baud**: hunt the firmware for a baud-rate-change command (or a
   compile-time const). If found, switch the ESP32's HardwareSerial to
   match. 460 800 baud handles 50 KB/s with headroom.

c) **Process fully on the ESP32**: don't pipe raw radar frames over MQTT.
   Run range-bin selection + phase extract + filter on-device, publish only
   the filtered result. The radar UART feed is local (UART0); the data
   doesn't have to escape the ESP32. This is the right architecture; it just
   requires more code than (a).

Decision: try (a) first to validate decoding works. If breath-only is enough,
ship that. Only bother with (b) or (c) if heart-tracking is also a goal.

#### C4. Host-side pipeline

Write a real DSP pipeline on the ESP32 (or, if cheating, in the browser via
MQTT — but UART → ESP32 → MQTT round-trip alone is more latency than the
firmware's IIR, so this only works if we accept losing some of the win).

The pipeline mirrors the firmware's:

```
range-Doppler matrix
  → (CFAR-style detection or hard-coded chest range bin)
  → complex value at chosen (range, Doppler)
  → atan2 → wrapped phase
  → unwrap against previous frame
  → integrate (or directly band-pass — depending on what `total_phase`
    actually contained, see Path B's open question)
  → publish breath_phase
```

For an artist demo, hard-coding "chest is at range bin 14, Doppler bin 4"
based on a calibration step at boot is dramatically simpler than running a
CFAR detector and works fine for stationary subjects. Calibrate by averaging
the matrix over the first 5 seconds and picking the strongest non-zero-Doppler
peak.

#### C5. Verification

Same A/B comparison as Path B6. Add a third topic
`hands/mmwave/raw_breath_band` and toggle between the three:
- `smooth_fast_breath` (current, slew + LP on Δφ)
- `breath_band` (Path B, integrate + band-pass on Δφ)
- `raw_breath_band` (Path C, host-side pipeline on raw matrices)

Measure end-to-end latency: do a sharp breath-hold and breath-resume; time
how long the visualisation takes to track the change.

### Hard-stop criteria

These pause Path C until separate work is done:

- **C1 fails entirely** (no raw frames arrive after `0x0A14`): we'd need a
  flash dump from a live device via SWD to verify the command parser. That's
  a hardware project, not a firmware-disassembly project. Punt.
- **C2 fails to decode the matrix**: more data + more controlled experiments.
  May need to write an oscilloscope-style live visualiser of every
  `0x0A32`/`0x0A34` frame to see motion patterns.
- **Bandwidth path doesn't pan out** (no baud-change command exists, and
  on-device pipeline is too much work): downsample-and-accept-breath-only is
  the fallback.

### When to abandon C in favour of "it works well enough"

If Path B yields a breath signal that:
- visibly tracks your inhale/exhale within ~1 second of motion
- is stable enough for a 30-minute session without retuning
- looks like a sine wave to your eye

…then C is overengineering. Ship B and document C as "explored, not
implemented." The mmwave_explainer can carry the C analysis as a "what we
deliberately didn't do" footnote.

---

## Suggested execution order

1. **Today (30 min):** B1 — Python dry-run on existing captures.
2. **If B1 looks promising (1-2 hours):** B2 → B3 → B5 — implement and A/B.
3. **After living with B for an evening or two:** decide. Either ship B as
   canonical, or commit to C.
4. **C is its own session(s).** Block out 4-8 hours of focused time. Have
   the radar, a logic analyser or `screen`/`pyserial`, and the Ghidra report
   open at the same time.
