"""
Dry-run for the proposed integrate-then-band-pass breath filter.

Run with uv (no manual env setup needed):

    cd /Users/fdb/Documents/Arduino/breath_demo
    uv run --with numpy,scipy,matplotlib tools/breath_filter_dryrun.py captures/20260508-capture-2.csv

Outputs:
    captures/<basename>__dryrun.png          comparison plot
    stdout                                    sample rate, latency stats, recommended coefficients
"""

import sys
from pathlib import Path

import numpy as np
import scipy.signal as sps
import matplotlib.pyplot as plt


def load_capture(path: Path):
    """Load one of the captures/*.csv files into a structured array."""
    rows = np.genfromtxt(path, delimiter=",", names=True)
    # Drop the warm-up rows where every signal is zero.
    valid = (rows["total_phase"] != 0) | (rows["breath_phase"] != 0)
    if not valid.any():
        raise RuntimeError("Capture contains only zero rows.")
    first = np.argmax(valid)
    rows = rows[first:]
    return rows


def estimate_fs(ms: np.ndarray) -> float:
    """Frame rate from millisecond timestamps. Captures aren't perfectly periodic,
    so use the median dt (robust to occasional pauses)."""
    dt_ms = np.diff(ms)
    dt_s = np.median(dt_ms) / 1000.0
    return 1.0 / dt_s


def design_bandpass(fs: float, low_hz: float, high_hz: float, order: int = 2):
    """Butterworth band-pass via SOS (numerically stable for low frequencies)."""
    nyq = fs / 2.0
    sos = sps.butter(order, [low_hz / nyq, high_hz / nyq], btype="band", output="sos")
    return sos


def lag_samples(reference: np.ndarray, candidate: np.ndarray) -> int:
    """How many samples does `candidate` LEAD `reference` by, found via cross-correlation?
    Positive = candidate leads (i.e. reference lags behind candidate)."""
    # Z-score both so amplitude differences don't dominate.
    def z(x):
        x = x - x.mean()
        s = x.std()
        return x / s if s > 1e-9 else x

    a = z(reference)
    b = z(candidate)
    corr = sps.correlate(a, b, mode="full")
    lags = sps.correlation_lags(a.size, b.size, mode="full")
    # We expect b to lead a (b is fast, a is slow ground truth) → peak at positive lag.
    return int(lags[np.argmax(corr)])


def main(capture_path: Path):
    rows = load_capture(capture_path)
    ms = rows["ms"]
    total_phase = rows["total_phase"]                  # what we proposed to integrate
    smooth_fast_breath = rows["smooth_fast_breath"]    # current production signal
    breath_phase = rows["breath_phase"]                # firmware's slow filtered output

    fs = estimate_fs(ms)
    n = len(rows)
    duration_s = (ms[-1] - ms[0]) / 1000.0

    print(f"capture:     {capture_path.name}")
    print(f"samples:     {n}  ({duration_s:.1f} s)")
    print(f"sample rate: {fs:.2f} Hz  (median dt = {1000/fs:.1f} ms)")
    print()

    # --- Hypothesis A: total_phase IS already accumulated phase. Just band-pass it. ---
    sos_band = design_bandpass(fs, 0.10, 0.50, order=2)
    bp_direct = sps.sosfilt(sos_band, total_phase)

    # --- Hypothesis B: total_phase is Δφ. Integrate, then band-pass. ---
    phi = np.cumsum(total_phase)
    bp_integrated = sps.sosfilt(sos_band, phi)

    # --- Diagnostic: a leakier integrator to guard against drift ---
    leak = np.exp(-1.0 / (fs * 50.0))      # 50 s time constant
    phi_leaky = np.zeros_like(total_phase)
    for i in range(1, n):
        phi_leaky[i] = leak * phi_leaky[i - 1] + total_phase[i]
    bp_leaky = sps.sosfilt(sos_band, phi_leaky)

    # --- Cross-correlation lag against the firmware's ground-truth breath_phase ---
    # We trim the first ~10 s on both sides to avoid filter start-up transient bias.
    skip = int(10 * fs)
    if n > skip + 200:
        ref = breath_phase[skip:]
        for name, cand in [
            ("total_phase",                total_phase[skip:]),
            ("smooth_fast_breath (prod)",  smooth_fast_breath[skip:]),
            ("bp_direct (Hyp. A)",         bp_direct[skip:]),
            ("bp_integrated (Hyp. B)",     bp_integrated[skip:]),
            ("bp_leaky (Hyp. B + leak)",   bp_leaky[skip:]),
        ]:
            lead = lag_samples(ref, cand)
            t_lead = lead / fs
            print(f"  {name:34s} leads breath_phase by {lead:+5d} samples  ({t_lead:+.2f} s)")
    print()

    # Suggested coefficients (single biquad, scipy ba form) for documentation.
    b, a = sps.butter(2, [0.10 / (fs / 2), 0.50 / (fs / 2)], btype="band")
    print("scipy.signal.butter(2, [0.10, 0.50], btype='band', fs=%.2f) =>" % fs)
    print(f"  b = {b}")
    print(f"  a = {a}")
    print(f"  (4th-order overall; cascade as 2 biquads, or use sosfilt for stability)")
    print()
    sos = sps.butter(2, [0.10 / (fs / 2), 0.50 / (fs / 2)], btype="band", output="sos")
    print("Same as second-order sections (stable, recommended for embedded):")
    for i, row in enumerate(sos):
        print(f"  section {i}: b = [{row[0]:+.6f}, {row[1]:+.6f}, {row[2]:+.6f}],  "
              f"a = [{row[4]:+.6f}, {row[5]:+.6f}]")
    print()

    # ---------- plot ----------
    t = (ms - ms[0]) / 1000.0
    fig, axes = plt.subplots(5, 1, figsize=(13, 10), sharex=True)
    fig.suptitle(f"breath filter dry-run · {capture_path.name} · fs={fs:.1f} Hz · {duration_s:.0f} s",
                 fontweight="bold", y=0.995)

    axes[0].plot(t, total_phase, color="#c64d2e", lw=0.9)
    axes[0].set_ylabel("total_phase\n(input)")
    axes[0].set_title("input: per-frame value (firmware label says 'total_phase')",
                      loc="left", fontsize=10)

    axes[1].plot(t, phi, color="#444", lw=0.9, label="cumsum(total_phase)")
    axes[1].plot(t, phi_leaky, color="#2f6f73", lw=0.9, alpha=0.8,
                 label="leaky-cumsum (τ=50s)")
    axes[1].set_ylabel("integrated\nphase φ")
    axes[1].set_title("hypothesis B: integrate first; the leaky variant guards against float drift",
                      loc="left", fontsize=10)
    axes[1].legend(loc="upper right", fontsize=9, frameon=False)

    axes[2].plot(t, bp_direct, color="#c64d2e", lw=1.1, label="band-pass on raw total_phase")
    axes[2].plot(t, bp_integrated, color="#2f6f73", lw=1.4,
                 label="band-pass on cumsum(total_phase)")
    axes[2].set_ylabel("band-pass\noutput")
    axes[2].set_title("hypothesis A vs B at the same band-pass (0.1-0.5 Hz Butterworth, order 2)",
                      loc="left", fontsize=10)
    axes[2].legend(loc="upper right", fontsize=9, frameon=False)
    axes[2].axhline(0, color="#aaa", lw=0.5)

    axes[3].plot(t, smooth_fast_breath, color="#444", lw=1.4,
                 label="current production: slew + 1-pole LP")
    axes[3].plot(t, bp_integrated, color="#2f6f73", lw=1.2, alpha=0.85,
                 label="proposed: integrate + band-pass")
    axes[3].set_ylabel("compared")
    axes[3].set_title("current production signal vs proposed Path-B output",
                      loc="left", fontsize=10)
    axes[3].legend(loc="upper right", fontsize=9, frameon=False)

    axes[4].plot(t, breath_phase, color="#aaa", lw=1.6,
                 label="firmware breath_phase (ground truth, ~5 s lag)")
    axes[4].plot(t, bp_integrated, color="#2f6f73", lw=1.2,
                 label="proposed Path-B (should lead by ~5 s)")
    axes[4].set_ylabel("vs firmware")
    axes[4].set_xlabel("time (s)")
    axes[4].set_title("ground-truth comparison: same shape, much earlier",
                      loc="left", fontsize=10)
    axes[4].legend(loc="upper right", fontsize=9, frameon=False)

    for ax in axes:
        ax.grid(alpha=0.25)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    plt.tight_layout(rect=[0, 0, 1, 0.985])
    out = capture_path.with_name(capture_path.stem + "__dryrun.png")
    plt.savefig(out, dpi=130)
    print(f"wrote {out}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    main(Path(sys.argv[1]))
