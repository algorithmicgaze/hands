# Latency investigation — what we thought, what we found

A research note on the question "where does the MR60BHA2's `breath_phase`
latency actually come from?" The short version is that we built a clean
hypothesis from disassembled firmware, designed a fix on top of it, then ran
a dry-run that contradicted both. This document captures the chain of
reasoning so future-us doesn't re-derive it from scratch.

---

## 1. The question

`breath_demo.ino` deliberately ignores the radar's `breath_phase` output and
derives its own breath signal from `total_phase`, slew-limited and one-pole
low-passed. The reason given in the project's README:

> `breath_phase` is the cleanest respiration waveform, but it has about 5 s
> of latency. That delay appears to come from the radar firmware, not Wi-Fi
> or MQTT.

We wanted to confirm where the lag came from, and ideally improve on the
current filter.

---

## 2. What the firmware told us

We ran a Ghidra disassembly on `MR60BHA2_eeprom_1.6.12.bin` (42 356 bytes;
ARM Cortex-M Thumb-2 firmware on an Andar ADT6101P SoC, no FPU, hardware FFT
engine memory-mapped at `0x40022000`). The reverse-engineering pass
recovered the entire DSP pipeline:

```
32 chirps × 256 range bins per frame, ~20 Hz frame rate
   ↓
   range FFT (256-pt complex, hardware engine)
   doppler FFT (32-pt across slow-time, hardware engine)
   |·|² + FFT-shift
   target detection (CFAR-like) → selected range bin
   atan2 phase extraction
   phase unwrap (across 30 fine bins per frame)
   φ[n] (per-frame scalar phase)
   ↓
   Δφ[n] = φ[n] − φ[n−1]                  ← published as 0x0A13 float #1
   ↓                ↓
   4-biquad         8-biquad
   IIR (breath)     IIR (heart)
   ↓                ↓
   breath_phase     heart_phase            ← published as 0x0A13 float #2 / #3
   ↓
   128-sample shift register (per signal)
   256-pt FFT, peak-pick
   ↓
   breath_rate, heart_rate (BPM)          ← published as 0x0A14 / 0x0A15
```

Key claims from the disassembly that drove our hypothesis:

1. **The first float of every `0x0A13` frame is per-frame Δφ**, not
   accumulated phase. The library labels it "total_phase" but the
   reverse-engineered code path computes it as `φ[n] − φ[n−1]`.
2. **`breath_phase` is the output of a 4-section biquad IIR cascade** band-pass
   tuned to roughly 0.3 Hz. The coefficients live at flash `0x00011B10`,
   past the end of the OTA blob, so we couldn't read them directly.
3. **The BPM path uses a 128-sample shift register** at 20 Hz, which means
   the FFT spectrum that drives it can't say anything meaningful for the
   first 6.4 s after start-up.
4. **No firmware command exposes a faster filter or a shorter buffer** in
   v1.6.12.

These claims are independently sound — they match each other and they match
the call-graph topology recovered from disassembly. But (1) — the claim
that total_phase is Δφ — turned out to be the load-bearing one for our
proposed fix, and is the claim the data later contradicted.

---

## 3. The hypothesis we built

Given (1), the obvious improvement was:

> The firmware ships Δφ unfiltered as `total_phase`. If we accept Δφ as the
> rawest available signal and do our own band-pass on the host, we sidestep
> the firmware's slow IIR entirely. Step one: integrate Δφ to recover
> continuous phase. Step two: apply a 2nd-order Butterworth band-pass at
> 0.1–0.5 Hz, which is the textbook breath band.

```c
// proposed Path B
phase += total_phase;          // Δφ → φ
y = bandpass(phase);           // breath-band filter, group delay ~0.5 s
publish(y);                    // expected: leads firmware breath_phase by 4-5 s
```

This was written up at length in `PLAN_FAST_BREATH.md`. The expected
outcome was an order-of-magnitude latency improvement: 5 s of firmware lag
replaced by 0.5 s of group delay.

---

## 4. The dry-run

Before changing any firmware, we replayed `captures/20260508-capture-2.csv`
(81 s, 1313 samples, actual frame rate 16.4 Hz — not 20 Hz, the README's
claim is an upper bound, not the typical operating value) through the
proposed pipeline in Python (`tools/breath_filter_dryrun.py`).

The capture contains both `total_phase` (the input to our filter) and
`breath_phase` (the firmware's slow output) as parallel columns, recorded
on the same wire — so we have ground truth for what the firmware was doing
to its input at every moment of the recording.

We measured the lag of every candidate signal against the firmware's
`breath_phase` via cross-correlation peak. After trimming the first 10 s
to avoid filter start-up bias on either side:

| Candidate | Lead vs. firmware `breath_phase` |
|---|---|
| `total_phase` (raw) | **+0.61 s** |
| `smooth_fast_breath` (current production) | **+0.43 s** |
| `bp_direct` (band-pass `total_phase` directly) | **+0.49 s** |
| `bp_integrated` (Path B as proposed: integrate, then band-pass) | **−0.61 s** |
| `bp_leaky` (Path B with leaky integrator) | **−0.55 s** |

Two of these results contradict the hypothesis:

1. **The firmware's steady-state lag is 0.6 s, not 5 s.** Whatever 5 s
   referred to (memory of a cold start, transient response to a breath
   hold, etc.), it is not what `breath_phase` does once the IIR has settled
   on a continuous breathing signal.
2. **Integrating `total_phase` makes the output *worse*, not better.** The
   integrate-then-band-pass path lands behind the firmware's own filter,
   not ahead of it.

The dry-run plot is `captures/20260508-capture-2__dryrun.png`. The second
pane in particular — `cumsum(total_phase)` versus a leaky variant — shows
the integrator drifting steadily downward over 80 s. If `total_phase`
were really pure Δφ, the integrator would track the chest's slow position;
in fact it produces a slow ramp dominated by what looks like a small DC
bias on the input.

---

## 5. Why the hypothesis failed

Two physical facts, both of which we should have foreseen and didn't:

### 5a. Integration is a 90° phase shift at every frequency

A perfect integrator has transfer function `H(s) = 1/s`, magnitude `1/ω`,
phase `−π/2`. At ω₀ = 2π·0.3 Hz ≈ 1.88 rad/s, that's a group delay of
1/ω₀ ≈ 0.53 s for the *integrator alone*, before the band-pass adds its
own group delay (~0.5 s). So integrate-then-band-pass costs roughly 1.0 s
of cumulative group delay versus band-pass-alone.

The firmware itself does the same thing the dry-run's `bp_direct` row
does — it band-passes the input directly, with no integrator stage. Its
own group delay is the 0.6 s we measured.

### 5b. `total_phase` may not be Δφ in the way the disassembly suggested

Either the disassembly's reading of which variable lands in the first float
of `0x0A13` was off by one stage, or the radar firmware does some
intermediate processing (e.g. high-pass with a slow cutoff) before
shipping it that lets the value sit and not require integration. The
empirical signature is unambiguous: integrating it produces drift that is
not present in `breath_phase` itself, and band-passing it directly produces
output that is correctly aligned (with the right group delay) against
`breath_phase`. Whatever `total_phase` is, *the host should treat it as
already-phase-like, not as a derivative*.

We noted this open question in `mmwave_explainer.html`'s footnotes
("the page treats breath_phase = filtered total_phase. The firmware
actually feeds the IIR with the per-frame difference Δφ…") but did not
weigh it heavily enough in the planning. The dry-run made it dispositive.

---

## 6. What the data does and doesn't tell us

**It tells us:**

- The firmware's steady-state group delay is sub-second (~0.6 s), not 5 s.
- The current production filter (`smooth_fast_breath`) is already within
  half a second of the firmware's filter and is faster than the firmware
  by ~0.2 s on this capture.
- A direct band-pass on `total_phase` (no integration) is a marginal but
  consistent improvement over the current filter.
- The integrate-then-band-pass approach is worse than either.

**It does not tell us:**

- Whether the original "5 s" perception was a cold-start phenomenon (most
  likely), a transient-response phenomenon (also plausible — IIRs ring on
  steps), or a different operating mode of an earlier firmware version.
  We have one steady-state capture; we do not have a "user holds breath
  for 10 s and resumes" capture against which to measure the firmware's
  transient response.
- What `total_phase` actually represents at the bit level. The disassembly
  says one thing, the empirical signature says another. Resolving this
  would require either (a) a flash dump of the live device covering the
  IIR coefficient region or (b) running the radar in "raw mode" (host
  command `0x0A14`) and re-deriving phase from the range-Doppler matrix
  ourselves.

---

## 7. Practical consequences

Three things that should change in the project given these findings:

1. **The README claim that `breath_phase` lags by 5 s is not accurate** as
   a steady-state characterisation. Update it to "lags on cold start by
   several seconds while the IIR settles; in steady state the lag is
   sub-second." Note this is qualitative; we have one capture, not a
   warm-up-time measurement.
2. **The `mmwave_explainer.html` framing of "the firmware lags by 5 s, so
   we ignore it"** is technically true at start-up and misleading in
   steady state. The piece's argument ("filter where you control the
   latency budget") still stands, but the magnitude of the win is
   smaller than it claims. The explainer should distinguish *transient
   ringing* from *steady-state group delay* in §10/§12.
3. **Path B as written in `PLAN_FAST_BREATH.md` is wrong.** The integrate
   step degrades the output. The corrected Path B is "band-pass
   `total_phase` directly", which gains ~0.06 s over the current filter —
   a marginal improvement worth doing but not a transformation.

The interesting prize remaining is **transient response, not steady-state
lag**. If the user holds their breath, sneezes, or shifts posture, a
narrow-band IIR will ring for several seconds — that's the perceptual
"latency" that prompted this entire investigation. Path C (raw mode with
a host-side pipeline) is justified by transient response, not by the
mythical 5 s steady-state lag.

---

## 8. Lessons that generalise

- **Cross-correlation against ground truth is much more honest than
  eyeballing.** This investigation cost 30 minutes; the same
  investigation done by flashing iterations of `breath_demo.ino` and
  watching curves would have taken hours and never produced the lag
  numbers we got from `tools/breath_filter_dryrun.py`.
- **A reverse-engineered call graph is a topological claim, not a
  semantic one.** The Ghidra agent recovered the right pipeline shape;
  what it called "Δφ" turned out empirically to be something more like
  already-phase. Disassembly tells us which functions are connected, not
  always what units the data is in. When semantics matter, validate
  against captured data.
- **Settling time and steady-state lag are both real and not the same
  thing.** Mixing them up gave us a 10× wrong magnitude on the win, then
  a wrong filter design intended to recover it. Future characterisations
  should measure both separately: a controlled cold-start latency test
  *and* a controlled step-response test.
- **Dry-runs before firmware changes are the right policy.** Even when
  the change is small (~20 lines), the cost of being wrong on hardware
  (re-flash, re-test, lingering doubt) exceeds the cost of writing a
  Python replay against captured data.

---

## 9. Artefacts referenced

- `breath_demo.ino` — the production sketch, slew + 1-pole low-pass on
  `total_phase`.
- `tmp/MR60BHA2_eeprom_1.6.12.bin` — the firmware blob we disassembled.
- `tmp/firmware_stripped.bin`, `tmp/scripts/*.py` — Ghidra working files.
- `captures/20260508-capture-2.csv` — the steady-state capture used in the
  dry-run.
- `captures/20260508-capture-2__dryrun.png` — the comparison plot.
- `tools/breath_filter_dryrun.py` — the dry-run replay script.
- `mmwave_explainer.html` — the long-form explainer that incorporates the
  Ghidra findings (and inherits the "5 s lag" framing that this document
  partially walks back).
- `PLAN_FAST_BREATH.md` — the plan that proposed Path B; section 4 of this
  document is what made parts of that plan obsolete.
