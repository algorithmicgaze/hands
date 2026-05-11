// breath_debug.ino — barebones MR60BHA2 latency probe (CSV-logging variant).
//
// PURPOSE
//   Strip out everything that could mask radar-side latency (WiFi, MQTT,
//   NeoPixel) and stream every signal the library exposes as CSV at maximum
//   rate. Capture the stream to a logfile via macOS `screen -L`, press
//   single-character markers as you breathe, then analyze the file offline.
//
// HOW TO RUN (macOS)
//   1. Upload this sketch to the XIAO.
//   2. Close the Arduino IDE Serial Monitor (it would hold the port).
//   3. From a Terminal in your project dir:
//        screen -L /dev/cu.usbmodem101 115200
//      `-L` writes everything to ./screenlog.0 in the cwd.
//   4. Press single keys to mark events as you breathe (instant — `screen`
//      sends each keystroke immediately, no Enter needed):
//        q = idle    1 = slow inhale   2 = slow exhale
//        i = SHARP inhale     e = SHARP exhale
//        h = hold    r = rapid breathing    0 = clear marker
//        ? = print protocol help
//   5. Quit screen with: Ctrl-A then K then Y
//   6. Rename the log: `mv screenlog.0 breath_session.log`
//
// CSV LAYOUT (one row per radar phase frame, ~20 Hz)
//   t_ms,total_phase,breath_phase,heart_phase,
//   total_vel,breath_vel,heart_vel,
//   breath_rate,heart_rate,distance,human,marker
//
//   Phases   ±1 range (radians)
//   Velocities  per-frame delta of phase (~0.001..0.05 typical)
//   breath_rate, heart_rate  BPM (slow, ~1 Hz updates; last-known value)
//   distance  cm (last-known value)
//   human    0/1 (latched presence)
//   marker   0..6 (current test-event tag, also logged as # MARKER lines)
//
// EVERYTHING NON-CSV STARTS WITH `#`
//   Firmware report, marker change events, breath/heart-rate updates, and
//   protocol help all print as `# ...` lines so a parser can split them out
//   trivially: data rows start with a digit, annotations start with `#`.

#include <Arduino.h>
#include "Seeed_Arduino_mmWave.h"

#ifdef ESP32
#  include <HardwareSerial.h>
HardwareSerial mmWaveSerial(0);
#else
#  define mmWaveSerial Serial1
#endif

SEEED_MR60BHA2 mmWave;

// ---- Cached signals (last-known values) ----
float total_phase = 0, breath_phase = 0, heart_phase = 0;
float breath_rate = 0, heart_rate  = 0;   // BPM
float distance    = 0;                    // cm

// On-device derivatives. We seed on first sample so the first delta isn't a
// huge spike from 0.
float total_vel = 0, breath_vel = 0, heart_vel = 0;
float total_phase_prev = 0, breath_phase_prev = 0, heart_phase_prev = 0;
bool  derivs_seeded = false;

// Human-presence: the library's isHumanDetected() can't distinguish "no fresh
// frame" from "fresh frame: nobody there" — both return false. So we latch
// true on any positive read and clear it after HUMAN_STALE_MS of no positive.
bool     human                = false;
uint32_t human_last_seen_ms   = 0;
const uint32_t HUMAN_STALE_MS = 2000;

// Firmware report (auto-pushed by radar on its boot — see boot drain below).
// NOTE: the library spells the union member `firmware_verson` (missing 'i').
// That's a typo upstream; using it as-is.
FirmwareInfo fw_cached    = {0};
bool         fw_captured  = false;

// Test-protocol marker. Driven by single-character serial input from `screen`
// or any non-line-buffered terminal.
int         marker       = 0;
const char* marker_label = "idle";
uint32_t    boot_ms      = 0;

// ──────────────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────────────

// Lines starting with '#' are NOT in `name:value\t` form, so the Serial
// Plotter ignores them. They show up only in the Serial Monitor — perfect for
// instructions, firmware info, and timestamped marker logs.
void printFirmware() {
  Serial.printf(
    "# mmWave firmware: project=%u version=%u.%u.%u (raw=0x%08lX)\n",
    fw_cached.firmware_verson.project_name,
    fw_cached.firmware_verson.major_version,
    fw_cached.firmware_verson.sub_version,
    fw_cached.firmware_verson.modified_version,
    (unsigned long)fw_cached.value);
}

void captureFirmware() {
  if (fw_captured) return;
  FirmwareInfo fw;
  if (!mmWave.getFirmwareInfo(fw)) return;
  fw_cached    = fw;
  fw_captured  = true;
  printFirmware();
}

void printProtocol() {
  Serial.println(F("# ============ BREATH DEBUG PROTOCOL ============"));
  Serial.println(F("# Send single characters via Serial to mark events:"));
  Serial.println(F("#   q = quiet baseline (idle)"));
  Serial.println(F("#   1 = slow inhale"));
  Serial.println(F("#   2 = slow exhale"));
  Serial.println(F("#   i = SHARP inhale (instant)"));
  Serial.println(F("#   e = SHARP exhale (instant)"));
  Serial.println(F("#   h = hold breath"));
  Serial.println(F("#   r = rapid breathing"));
  Serial.println(F("#   0 = clear marker"));
  Serial.println(F("#   ? = print this help"));
  Serial.println(F("#"));
  Serial.println(F("# Suggested run (~60 s):"));
  Serial.println(F("#   q (5s) -> 1 -> 2 -> 1 -> 2 -> i, hold(3s),"));
  Serial.println(F("#   e, hold(3s) -> r (10s) -> q"));
  Serial.println(F("#"));
  Serial.println(F("# Goal: from the captured CSV, compute which signal"));
  Serial.println(F("# reacts FIRST after each marker change. The signal"));
  Serial.println(F("# with lowest onset latency wins — drive viz off it."));
  Serial.println(F("# ================================================"));
}

void setMarker(int n, const char* label) {
  marker       = n;
  marker_label = label;
  float t_s    = (millis() - boot_ms) / 1000.0f;
  Serial.printf("# [t=%7.2fs] MARKER %d = %s\n", t_s, n, label);
}

void handleSerialKey() {
  while (Serial.available()) {
    int c = Serial.read();
    switch (c) {
      case 'q': setMarker(0, "idle");        break;
      case '1': setMarker(1, "slow inhale"); break;
      case '2': setMarker(2, "slow exhale"); break;
      case 'i': setMarker(3, "sharp inhale"); break;
      case 'e': setMarker(4, "sharp exhale"); break;
      case 'h': setMarker(5, "hold");        break;
      case 'r': setMarker(6, "rapid");       break;
      case '0': setMarker(0, "idle");        break;
      case '?': printProtocol();             break;
      default:  /* ignore \r, \n, spaces, junk */ break;
    }
  }
}


// ──────────────────────────────────────────────────────────────────────────
//  setup()
// ──────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  // Brief wait for USB serial enumeration so we don't lose the boot banner.
  // On boards without native USB, this just times out harmlessly after 2 s.
  while (!Serial && millis() < 2000) {}

  mmWave.begin(&mmWaveSerial);
  Serial.println();
  Serial.println(F("# breath_debug.ino — barebones MR60BHA2 latency probe"));
  printProtocol();
  Serial.println(F("# Waiting for mmWave firmware report (~800 ms)..."));

  // Aggressive boot drain — the radar pushes ReportFirmware (type 0xFFFF)
  // exactly once shortly after IT boots. There's no command to request it,
  // so we have to be listening when it arrives.
  uint32_t deadline = millis() + 800;
  while (millis() < deadline && !fw_captured) {
    mmWave.update(50);
    captureFirmware();
  }
  if (!fw_captured) {
    Serial.println(F("# (firmware not seen in boot drain — will keep polling)"));
  }

  boot_ms = millis();
  Serial.println(F("# Streaming. Send '?' for protocol help."));

  // CSV header — printed exactly once, immediately before the data rows.
  // Any line starting with `#` is an annotation; data rows start with a digit.
  Serial.println(F("t_ms,total_phase,breath_phase,heart_phase,"
                   "total_vel,breath_vel,heart_vel,"
                   "breath_rate,heart_rate,distance,human,marker"));
}

// ──────────────────────────────────────────────────────────────────────────
//  loop()
// ──────────────────────────────────────────────────────────────────────────

void loop() {
  handleSerialKey();
  captureFirmware();   // safety-net for late firmware push (e.g. radar reset)

  // Non-blocking single-pass drain of the UART RX buffer. If no complete
  // frame was processed this iteration, yield 1 ms and try again. delay(1)
  // is also enough time for ~3 UART bytes at 115200 baud to land.
  if (!mmWave.update(0)) {
    delay(1);
    return;
  }

  // Each getter is destructive-read: returns true once when a fresh frame
  // arrives, then false until the next one. We pull every one of them.

  bool got_phase = false;
  {
    float tp, bp, hp;
    if (mmWave.getHeartBreathPhases(tp, bp, hp)) {
      total_phase  = tp;
      breath_phase = bp;
      heart_phase  = hp;
      got_phase    = true;
    }
  }

  // Rates update at ~1 Hz. Print human-readable to monitor when fresh so you
  // can sanity-check that the radar agrees with reality.
  {
    float r;
    if (mmWave.getBreathRate(r)) {
      breath_rate = r;
      Serial.printf("# breath_rate: %.1f bpm\n", r);
    }
    if (mmWave.getHeartRate(r)) {
      heart_rate = r;
      Serial.printf("# heart_rate:  %.1f bpm\n", r);
    }
  }

  {
    float d;
    if (mmWave.getDistance(d)) distance = d;
  }

  // Human-presence latch (see HUMAN_STALE_MS comment near declaration).
  if (mmWave.isHumanDetected()) {
    human              = true;
    human_last_seen_ms = millis();
  } else if (human && millis() - human_last_seen_ms > HUMAN_STALE_MS) {
    human = false;
  }

  // Compute derivatives ON the fresh phase frame so dt is the radar's actual
  // packet interval (~50 ms at 20 Hz). Doing this on millis()-based timers
  // would alias against the loop rate and add jitter.
  if (got_phase) {
    if (!derivs_seeded) {
      total_phase_prev  = total_phase;
      breath_phase_prev = breath_phase;
      heart_phase_prev  = heart_phase;
      derivs_seeded     = true;
    } else {
      total_vel  = total_phase  - total_phase_prev;
      breath_vel = breath_phase - breath_phase_prev;
      heart_vel  = heart_phase  - heart_phase_prev;
      total_phase_prev  = total_phase;
      breath_phase_prev = breath_phase;
      heart_phase_prev  = heart_phase;
    }
  }

  // Only phase frames become CSV rows. Other radar frames may update the
  // latched rate/distance/human fields above, but printing them as rows would
  // duplicate phase samples and poison latency/correlation measurements.
  if (!got_phase) {
    return;
  }

  // ── CSV row ──
  // All values in raw units (radians for phases, BPM for rates, cm for
  // distance, per-frame delta for velocities). t_ms is millis-since-boot so
  // the file timeline is independent of wall-clock; pair it with the
  // `# [t=...s] MARKER ...` annotation lines for ground-truth event timing.
  Serial.printf(
    "%lu,%.3f,%.3f,%.3f,%.4f,%.4f,%.4f,%.1f,%.1f,%.1f,%d,%d\n",
    (unsigned long)(millis() - boot_ms),
    total_phase, breath_phase, heart_phase,
    total_vel,   breath_vel,   heart_vel,
    breath_rate, heart_rate,   distance,
    human ? 1 : 0, marker);
}
