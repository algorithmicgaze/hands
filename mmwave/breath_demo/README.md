# Breath Demo

Low-latency breath control using the Seeed Studio 60 GHz MR60BHA2 mmWave sensor.

The goal is to drive a browser synth from a clean breathing waveform without the
large delay in the radar firmware's built-in breath signal.

## Hardware And Data Source

- Sensor: Seeed Studio MR60BHA2 60 GHz breathing / heartbeat mmWave sensor
- Board: ESP32-based Seeed/XIAO setup
- Arduino library: `Seeed_Arduino_mmWave`
- Browser transport: MQTT over Shiftr

The sensor sends a heart/breath phase packet containing three floats:

```cpp
total_phase, breath_phase, heart_phase
```

In practice:

- `breath_phase` is the cleanest respiration waveform, but it has about 5 s of
  latency. That delay appears to come from the radar firmware, not Wi-Fi or MQTT.
- `total_phase` reacts much faster, but includes more sharp jumps and small
  movement artifacts.

So the sketch ignores the delayed firmware breath waveform and derives its own
cleaner low-latency signal from `total_phase`.

## DSP Path

The live control signal is:

```text
MR60BHA2 total_phase
  -> slew limiter
  -> one-pole low-pass
  -> smooth_fast_breath
  -> MQTT
```

### 1. Read `total_phase`

The sketch calls:

```cpp
mmWave.getHeartBreathPhases(total_phase, unused_filtered_phase, unused_heart_phase)
```

Only `total_phase` is used. The other two values are read because the library API
returns all three together.

### 2. Slew-limit single-frame jumps

`total_phase` can spike by several units in one frame. Before smoothing, the
target value is limited to a maximum step around the current output:

```cpp
float smooth_target = constrain(total_phase,
                                smooth_fast_breath - SMOOTH_FAST_MAX_STEP,
                                smooth_fast_breath + SMOOTH_FAST_MAX_STEP);
```

Current tuning:

```cpp
const float SMOOTH_FAST_MAX_STEP = 0.70f;
```

This removes most one-frame bumps while still allowing the main inhale/exhale
curve to move quickly.

### 3. Smooth with a one-pole low-pass

After slew limiting, the signal is smoothed:

```cpp
smooth_fast_breath =
    SMOOTH_FAST_ALPHA * smooth_target +
    (1.0f - SMOOTH_FAST_ALPHA) * smooth_fast_breath;
```

Current tuning:

```cpp
const float SMOOTH_FAST_ALPHA = 0.15f;
```

Lower values are smoother and slower. Higher values are faster and noisier.

With the current settings, the signal has roughly 500 ms of latency in practice,
which has been acceptable for the synth interaction.

## MQTT Output

The sketch publishes exactly one live topic:

```text
hands/mmwave/smooth_fast_breath
```

No frame-rate, distance, velocity, direction, `breath_phase`, or `total_phase`
topics are published in the cleaned production sketch.

## Serial Plotter Output

For local checking, the sketch prints:

```text
smooth_fast:<value>    axis_lo:-1.00    axis_hi:1.00
```

`axis_lo` and `axis_hi` are static traces that keep Arduino Serial Plotter from
auto-scaling too aggressively. They are not sent over MQTT.

The plotter range is controlled by:

```cpp
const float PLOTTER_Y_RANGE = 1.0f;
```

## Browser Synth

`index.html` subscribes to:

```text
hands/mmwave/smooth_fast_breath
```

The browser should treat this as the already-prepared breath control signal.
Most preprocessing belongs on the Arduino side so the synth engine can stay
simple and predictable.

## Capture And Tuning Notes

The current filter was tuned from recordings in `captures/`.

The tuning method was:

1. Record `total_phase`, the Arduino candidate filter, and the radar
   `breath_phase`.
2. Treat `breath_phase` as the clean but delayed reference.
3. Tune an Arduino-friendly filter from `total_phase` to approximate the main
   shape of `breath_phase` with much less latency.

Capture analysis showed the phase packet rate is about 16 Hz. The current
slew-limited low-pass matched the clean reference substantially better than the
earlier simple low-pass while keeping latency around half a second.

## Important Constants

In `breath_demo.ino`:

```cpp
const float SMOOTH_FAST_ALPHA    = 0.15f;
const float SMOOTH_FAST_MAX_STEP = 0.70f;
const float PLOTTER_Y_RANGE      = 1.0f;
```

Suggested tuning direction:

- More smooth / less twitchy: lower `SMOOTH_FAST_ALPHA` or lower
  `SMOOTH_FAST_MAX_STEP`
- Faster response: raise `SMOOTH_FAST_ALPHA` or raise `SMOOTH_FAST_MAX_STEP`
- Wider Serial Plotter view: raise `PLOTTER_Y_RANGE`
