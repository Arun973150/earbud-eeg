"""Resting-state brain check from the earbud: eyes closed, then eyes open.

Talks to the web server through one JSON event per stdout line:
    PROGRESS {"phase": ..., "elapsed": ..., "total": ...}
    QUALITY {"std_uv": ..., "grade": "good" | "poor" | "none", "railing": bool}
    RESULT_JSON {...}
    ERROR_JSON {"code": ..., "message": ...}

Usage:
    python brain_check.py --list-ports
    python brain_check.py --contact [--max 60] [--simulate]
    python brain_check.py --record --closed 60 --open 60 --session ID --out DIR
                          [--simulate --seed TEXT] [--fast] [--screen-seizures]
"""
import argparse
import json
import os
import sys
import time
import zlib
from datetime import datetime

import numpy as np
from scipy import signal
from scipy.integrate import trapezoid

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import eeg_processor as ep  # noqa: E402

SR = ep.SAMPLING_RATE
STD_GOOD = 4.0  # µV, same thresholds as check_electrode.py
STD_POOR = 2.0
EPOCH_S = 2.0
BANDS = {"delta": (1, 4), "theta": (4, 8), "alpha": (8, 13), "beta": (13, 30)}


def emit(kind, payload):
    print(f"{kind} {json.dumps(payload, separators=(',', ':'))}", flush=True)


def fail(code, message, exit_code):
    emit("ERROR_JSON", {"code": code, "message": message})
    sys.exit(exit_code)


# --------------------------------------------------------------------------- sources

class SimulatedSource:
    """Plausible single-channel ear-EEG in ADC counts: 1/f background, an alpha rhythm
    at a per-person frequency that is stronger with eyes closed, some theta, 50 Hz hum
    and blink artifacts with eyes open. Clearly tagged as simulated downstream."""

    def __init__(self, seed_text, closed_s, total_s, task_after_s=None):
        # "person|session": the person part fixes their own rhythm, the session part adds
        # the small day-to-day variation real repeat recordings have.
        trait = np.random.default_rng(zlib.crc32(seed_text.split("|")[0].encode("utf-8")))
        rng = np.random.default_rng(zlib.crc32(seed_text.encode("utf-8")))
        self.paf = 8.5 + 2.5 * trait.random() + (0.25 * rng.standard_normal() if "|" in seed_text else 0.0)
        n = int(total_s * SR)
        t = np.arange(n) / SR

        white = rng.standard_normal(n)
        spectrum = np.fft.rfft(white)
        f = np.fft.rfftfreq(n, 1 / SR)
        f[0] = f[1]
        pink = np.fft.irfft(spectrum / np.sqrt(f), n)
        pink *= 12.0 / np.std(pink)

        drift = np.cumsum(rng.standard_normal(n)) * 0.002
        alpha_phase = 2 * np.pi * np.cumsum(self.paf + drift) / SR
        envelope = 1 + 0.3 * np.sin(2 * np.pi * 0.2 * t + rng.random() * 6)
        eyes_closed = t < closed_s
        if task_after_s is None:
            alpha_amp = np.where(eyes_closed, 9.0, 4.5)
        else:  # relaxed eyes-open rest, then concentrating: alpha drops, theta rises
            alpha_amp = np.where(t < task_after_s, 6.0, 3.6)
        alpha = alpha_amp * envelope * np.sin(alpha_phase)
        theta_amp = 6.0 if task_after_s is None else np.where(t < task_after_s, 5.0, 7.0)
        theta = theta_amp * np.sin(2 * np.pi * (5.5 + rng.random()) * t + rng.random() * 6)
        hum = 12.0 * np.sin(2 * np.pi * ep.MAINS_HZ * t)

        blinks = np.zeros(n)
        for start in np.arange(closed_s + 2, total_s - 1, 4.0):
            centre = start + rng.random()
            blinks += 60.0 * np.exp(-0.5 * ((t - centre) / 0.08) ** 2)

        uv = pink + alpha + theta + hum + blinks
        self.adc = np.clip(512 + uv / (500 / 1023), 0, 1023)
        self.cursor = 0

    def read(self, n):
        chunk = self.adc[self.cursor:self.cursor + n]
        self.cursor += len(chunk)
        return chunk.tolist()


def acquire_simulated(source, total_s, fast, on_progress, should_stop=None):
    samples = []
    start = time.time()
    last = -1.0
    while len(samples) < int(total_s * SR) and not (should_stop and should_stop()):
        samples.extend(source.read(int(SR * 0.1)))
        elapsed = len(samples) / SR if fast else time.time() - start
        if elapsed - last >= 0.5:
            last = elapsed
            on_progress(elapsed, samples)
        if not fast:
            time.sleep(max(0.0, len(samples) / SR - (time.time() - start)))
    return np.array(samples, dtype=float), len(samples) / SR


def acquire_earbud(total_s, on_progress, should_stop=None, started=None):
    port = ep.find_port()
    ser = ep.connect_to_arduino(port)
    if ser is None:
        fail("NOT_CONNECTED", f"No earbud found on {port}. Plug in the Arduino and try again.", 2)
    try:
        if started is not None:
            started['t0'] = time.time()
        data, _ = ep.collect_eeg_data(ser, duration_seconds=total_s, on_progress=on_progress, should_stop=should_stop)
    finally:
        if ser.is_open:
            ser.close()
    return np.asarray(data, dtype=float), total_s


# --------------------------------------------------------------------------- quality

_LIVE_SOS = signal.butter(4, [1, 40], btype="band", fs=SR, output="sos")


def live_quality(raw_samples):
    """Contact quality over the last 2 s, graded with the check_electrode.py thresholds."""
    window = np.asarray(raw_samples[-SR * 2:], dtype=float)
    if len(window) < SR:
        return None
    railing = bool(np.mean(window) < 50 or np.mean(window) > 970)
    uv = ep.convert_to_microvolts(window - np.mean(window))
    b, a = signal.iirnotch(ep.MAINS_HZ, 30, SR)
    clean = signal.sosfiltfilt(_LIVE_SOS, signal.filtfilt(b, a, uv))
    std = float(np.std(clean))
    grade = "good" if std >= STD_GOOD and not railing else "poor" if std >= STD_POOR else "none"
    # Last 2 s at 50 Hz so the browser can draw a live trace.
    wave = [round(float(v), 1) for v in clean[:: max(1, SR // 50)]]
    return {"std_uv": round(std, 2), "grade": grade, "railing": railing, "wave": wave}


def progress_reporter(phase_for):
    state = {"last_quality": -1.0}

    def report(elapsed, samples):
        phase, total = phase_for(elapsed)
        emit("PROGRESS", {"phase": phase, "elapsed": round(elapsed, 1), "total": total})
        if elapsed - state["last_quality"] >= 0.5:
            state["last_quality"] = elapsed
            q = live_quality(samples)
            if q:
                emit("QUALITY", q)

    return report


# --------------------------------------------------------------------------- features

def epochs_of(x):
    length = int(EPOCH_S * SR)
    count = len(x) // length
    return x[:count * length].reshape(count, length)


def clean_epochs(epochs, reference_ptp):
    """Drop flat epochs and anything with a peak-to-peak more than 3x the typical epoch."""
    ptp = np.ptp(epochs, axis=1)
    keep = (ptp <= 3 * reference_ptp) & (epochs.std(axis=1) > 0.5)
    return epochs[keep], int(keep.sum())


def spectrum(epochs):
    freqs, psd = signal.welch(epochs, fs=SR, nperseg=epochs.shape[1], nfft=epochs.shape[1] * 2, axis=1)
    return freqs, psd.mean(axis=0)


def band_power(freqs, psd, lo, hi):
    idx = (freqs >= lo) & (freqs < hi)
    return float(trapezoid(psd[idx], freqs[idx]))


def peak_alpha_frequency(freqs, psd):
    idx = (freqs >= 7) & (freqs <= 13)
    return float(np.sum(freqs[idx] * psd[idx]) / np.sum(psd[idx]))


def downsample_wave(x):
    """Whole segment at 50 Hz, enough for a readable trace in the browser."""
    return np.round(signal.decimate(x, 5), 1).tolist()


def relative_bands(freqs, psd):
    total = band_power(freqs, psd, 1, 30)
    return {name: round(band_power(freqs, psd, lo, hi) / total, 4) for name, (lo, hi) in BANDS.items()}


def spectrogram_of(x, eyes_open_at):
    """Time x frequency picture (2 s windows, 1 s steps, 1 Hz bins from 1-29 Hz), in dB."""
    f, t, sxx = signal.spectrogram(x, fs=SR, nperseg=2 * SR, noverlap=SR)
    rows = np.array([sxx[(f >= lo) & (f < lo + 1)].mean(axis=0) for lo in range(1, 30)])
    db = 10 * np.log10(np.maximum(rows, 1e-6))
    return {
        "times": np.round(t, 1).tolist(),
        "freqs": list(range(1, 30)),
        "power_db": np.round(db.T, 1).tolist(),
        "eyes_open_at": eyes_open_at,
    }


def analyze(raw, duration_s, closed_s, open_s):
    if len(raw) < SR * 10:
        fail("NO_DATA", f"Only {len(raw)} samples were received; check the Arduino stream and wiring.", 3)

    railing_pct = float(np.mean((raw <= 5) | (raw >= 1018)))
    data, measured_fs = ep.resample_to_nominal(raw, duration_s)
    filtered = ep.preprocess_eeg_data(data)

    ok, std_uv, range_uv = ep.check_signal_quality(filtered)
    if not ok:
        fail("FLAT_SIGNAL", "The signal is flat; the electrode is not touching the skin. Reposition the earbud and try again.", 4)
    quality, features, spectra, waveform, spectrogram = describe(filtered, closed_s, open_s, railing_pct, measured_fs)
    return filtered, quality, features, spectra, waveform, spectrogram


def describe(filtered, closed_s, open_s, railing_pct=0.0, measured_fs=float(SR)):
    """Everything shown in the report, from an already filtered µV signal at SR."""
    std_uv = float(np.std(filtered))
    range_uv = float(np.ptp(filtered))

    def segment(start_s, length_s):
        skip = min(5.0, length_s * 0.25)
        tail = min(2.0, length_s * 0.1)
        return filtered[int((start_s + skip) * SR):int((start_s + length_s - tail) * SR)]

    ec_epochs = epochs_of(segment(0, closed_s))
    eo_epochs = epochs_of(segment(closed_s, open_s))
    reference_ptp = float(np.median(np.ptp(np.vstack([ec_epochs, eo_epochs]), axis=1)))
    ec_kept, ec_n = clean_epochs(ec_epochs, reference_ptp)
    eo_kept, eo_n = clean_epochs(eo_epochs, reference_ptp)
    total_epochs = len(ec_epochs) + len(eo_epochs)
    kept_fraction = (ec_n + eo_n) / total_epochs if total_epochs else 0.0

    if ec_n < 2 or eo_n < 1 or kept_fraction < 0.5 or railing_pct > 0.05:
        grade = "poor"
    elif kept_fraction < 0.8:
        grade = "fair"
    else:
        grade = "good"

    quality = {
        "grade": grade,
        "kept_pct": round(100 * kept_fraction, 1),
        "epochs_eyes_closed": ec_n,
        "epochs_eyes_open": eo_n,
        "std_uv": round(std_uv, 2),
        "range_uv": round(range_uv, 2),
        "railing_pct": round(100 * railing_pct, 2),
        "fs_measured": round(measured_fs, 1),
        "mains_hz": ep.MAINS_HZ,
    }

    features = None
    spectra = None
    if ec_n >= 1 and eo_n >= 1:
        f_ec, p_ec = spectrum(ec_kept)
        f_eo, p_eo = spectrum(eo_kept)
        rel = relative_bands(f_ec, p_ec)
        alpha_ec = band_power(f_ec, p_ec, *BANDS["alpha"])
        alpha_eo = band_power(f_eo, p_eo, *BANDS["alpha"])
        theta_ec = band_power(f_ec, p_ec, *BANDS["theta"])
        features = {
            "paf_hz": round(peak_alpha_frequency(f_ec, p_ec), 2),
            "theta_alpha_ratio": round(theta_ec / alpha_ec, 3) if alpha_ec > 0 else None,
            "alpha_reactivity": round(min(alpha_ec / alpha_eo, 50.0), 3) if alpha_eo > 0 else None,
            "relative_power": rel,
            "relative_power_open": relative_bands(f_eo, p_eo),
        }
        keep = (f_ec >= 1) & (f_ec <= 45)
        spectra = {
            "freqs": np.round(f_ec[keep], 2).tolist(),
            "eyes_closed": [float(f"{v:.4g}") for v in p_ec[keep]],
            "eyes_open": [float(f"{v:.4g}") for v in p_eo[keep]],
        }

    waveform = {
        "fs": SR / 5,
        "eyes_closed": downsample_wave(filtered[:int(closed_s * SR)]),
        "eyes_open": downsample_wave(filtered[int(closed_s * SR):int((closed_s + open_s) * SR)]),
    }
    return quality, features, spectra, waveform, spectrogram_of(filtered, closed_s)


# --------------------------------------------------------------------------- modes

def run_contact(args):
    total = float(args.max)
    reporter = progress_reporter(lambda e: ("contact", total))
    if args.simulate:
        source = SimulatedSource(args.seed or "contact", total, total)
        acquire_simulated(source, total, args.fast, reporter)
    else:
        acquire_earbud(total, reporter)
    emit("RESULT_JSON", {"mode": "contact"})


def run_record(args):
    closed_s, open_s = float(args.closed), float(args.open)
    total = closed_s + open_s
    started = datetime.now()

    def phase_for(elapsed):
        return ("eyes_closed" if elapsed < closed_s else "eyes_open"), total

    reporter = progress_reporter(phase_for)
    if args.simulate:
        source = SimulatedSource(args.seed or args.session, closed_s, total)
        raw, duration = acquire_simulated(source, total, args.fast, reporter)
    else:
        raw, duration = acquire_earbud(total, reporter)

    emit("PROGRESS", {"phase": "processing", "elapsed": total, "total": total})
    filtered, quality, features, spectra, waveform, spectrogram = analyze(raw, duration, closed_s, open_s)

    edf_name = f"brain_{args.session}_{started.strftime('%Y%m%d_%H%M%S')}.edf"
    edf_path = ep.save_to_edf(
        filtered, patient_id=args.session,
        recording_info={"start_datetime": started, "duration": int(total)},
        file_name=edf_name, output_dir=args.out,
    )

    seizure = None
    if args.screen_seizures and quality["grade"] != "poor":
        emit("PROGRESS", {"phase": "screening", "elapsed": total, "total": total})
        from predict_seizure import SeizurePredictor
        seizure = SeizurePredictor().predict(edf_path)

    emit("RESULT_JSON", {
        "mode": "record",
        "source": "simulated" if args.simulate else "earbud",
        "protocol": {"eyes_closed_s": closed_s, "eyes_open_s": open_s},
        "started_at": started.isoformat(timespec="seconds"),
        "quality": quality,
        "features": features,
        "spectra": spectra,
        "waveform": waveform,
        "spectrogram": spectrogram,
        "edf_file": os.path.basename(edf_path),
        "seizure_screen": seizure,
    })


def run_reanalyze(args):
    """Recompute the report visuals from a saved (already filtered) EDF recording."""
    import pyedflib
    with pyedflib.EdfReader(args.reanalyze) as f:
        filtered = np.asarray(f.readSignal(0), dtype=float)
        fs = f.getSampleFrequency(0)
    if abs(fs - SR) > 1:
        filtered = signal.resample(filtered, int(round(len(filtered) / fs * SR)))
    closed_s, open_s = float(args.closed), float(args.open)
    duration = len(filtered) / SR
    if closed_s + open_s > duration + 1:
        closed_s = open_s = duration / 2
    quality, features, spectra, waveform, spectrogram = describe(filtered, closed_s, open_s)
    seizure = None
    if args.screen_seizures:
        from predict_seizure import SeizurePredictor
        seizure = SeizurePredictor().predict(args.reanalyze)
    emit("RESULT_JSON", {
        "mode": "reanalyze", "features": features, "spectra": spectra,
        "waveform": waveform, "spectrogram": spectrogram, "seizure_screen": seizure,
    })



# --------------------------------------------------------------------------- task EEG

def stdin_listener(state):
    """The server sends `STOP {"markers": [...]}` when the games are over."""
    import threading

    def read():
        for line in sys.stdin:
            if line.startswith("STOP"):
                try:
                    state["markers"] = json.loads(line[4:].strip() or "{}").get("markers", [])
                except json.JSONDecodeError:
                    state["markers"] = []
                state["stop"] = True
                return
    threading.Thread(target=read, daemon=True).start()


def block_spans(markers, t0, length_s):
    opened, spans = {}, {}
    for m in sorted(markers, key=lambda m: m.get("t", 0)):
        rel = float(m["t"]) - t0
        if m.get("phase") == "start":
            opened[m["label"]] = rel
        elif m.get("phase") == "end" and m["label"] in opened:
            a, b = max(0.0, opened.pop(m["label"])), min(length_s, rel)
            if b - a >= EPOCH_S:
                spans[m["label"]] = (round(a, 1), round(b, 1))
    return spans


def analyze_task(raw, duration_s, t0, markers):
    if len(raw) < SR * 10:
        fail("NO_DATA", f"Only {len(raw)} samples were received during the games.", 3)
    data, measured_fs = ep.resample_to_nominal(raw, duration_s)
    filtered = ep.preprocess_eeg_data(data)
    length_s = len(filtered) / SR
    all_epochs = epochs_of(filtered)
    reference_ptp = float(np.median(np.ptp(all_epochs, axis=1)))
    spans = block_spans(markers, t0, length_s)

    blocks = {}
    for label, (a, b) in spans.items():
        ep_all = epochs_of(filtered[int(a * SR):int(b * SR)])
        kept, n = clean_epochs(ep_all, reference_ptp)
        block = {"start_s": a, "end_s": b, "epochs": len(ep_all), "epochs_kept": n}
        if n:
            f, p = spectrum(kept)
            block["relative_power"] = relative_bands(f, p)
            block["power"] = {k: round(band_power(f, p, lo, hi), 4) for k, (lo, hi) in BANDS.items()}
        blocks[label] = block

    rest = blocks.get("rest", {}).get("power")
    changes = {}
    if rest:
        for label, block in blocks.items():
            pw = block.get("power")
            if label == "rest" or not pw:
                continue
            pct = lambda band: round(100 * (pw[band] / rest[band] - 1), 1) if rest[band] > 0 else None
            engagement = lambda q: q["beta"] / (q["alpha"] + q["theta"]) if (q["alpha"] + q["theta"]) > 0 else None
            e_task, e_rest = engagement(pw), engagement(rest)
            changes[label] = {
                "alpha_pct": pct("alpha"), "theta_pct": pct("theta"), "beta_pct": pct("beta"),
                "engagement_pct": round(100 * (e_task / e_rest - 1), 1) if e_task and e_rest else None,
            }

    timeline = []
    for i, epoch in enumerate(all_epochs):
        ok = np.ptp(epoch) <= 3 * reference_ptp and epoch.std() > 0.5
        if ok:
            f, p = spectrum(epoch[np.newaxis, :])
            rel = relative_bands(f, p)
            timeline.append({"t": round(i * EPOCH_S, 1), "alpha": rel["alpha"], "theta": rel["theta"]})
        else:
            timeline.append({"t": round(i * EPOCH_S, 1), "alpha": None, "theta": None})

    kept_total = sum(1 for x in timeline if x["alpha"] is not None)
    quality = {
        "grade": "good" if kept_total >= 0.8 * len(timeline) else "fair" if kept_total >= 0.5 * len(timeline) else "poor",
        "kept_pct": round(100 * kept_total / max(1, len(timeline)), 1),
        "fs_measured": round(measured_fs, 1),
        "mains_hz": ep.MAINS_HZ,
    }
    return {"blocks": blocks, "changes": changes, "timeline": timeline, "quality": quality, "length_s": round(length_s, 1)}


def run_task(args):
    """Record continuously while the games run; stop when the server sends STOP."""
    state = {"stop": False, "markers": []}
    stdin_listener(state)
    should_stop = lambda: state["stop"]
    reporter = progress_reporter(lambda e: ("task", float(args.max)))
    started = {}
    if args.simulate:
        source = SimulatedSource(args.seed or "task", 0, float(args.max), task_after_s=float(args.rest))
        started["t0"] = time.time()
        raw, duration = acquire_simulated(source, float(args.max), False, reporter, should_stop)
    else:
        raw, duration = acquire_earbud(float(args.max), reporter, should_stop, started)
        duration = time.time() - started["t0"]
    emit("PROGRESS", {"phase": "processing", "elapsed": duration, "total": duration})
    result = analyze_task(raw, duration, started["t0"], state["markers"])
    emit("RESULT_JSON", {"mode": "task", "source": "simulated" if args.simulate else "earbud", **result})


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--list-ports", action="store_true")
    mode.add_argument("--contact", action="store_true")
    mode.add_argument("--record", action="store_true")
    mode.add_argument("--reanalyze", metavar="EDF")
    mode.add_argument("--task", action="store_true")
    parser.add_argument("--max", type=float, default=60)
    parser.add_argument("--rest", type=float, default=20)
    parser.add_argument("--closed", type=float, default=60)
    parser.add_argument("--open", type=float, default=60)
    parser.add_argument("--session", default="session")
    parser.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "EEG_Data_new"))
    parser.add_argument("--simulate", action="store_true")
    parser.add_argument("--seed", default="")
    parser.add_argument("--fast", action="store_true")
    parser.add_argument("--screen-seizures", action="store_true")
    args = parser.parse_args()

    if args.list_ports:
        ports = ep.list_serial_ports()
        emit("RESULT_JSON", {"ports": ports, "selected": ep.find_port()})
    elif args.contact:
        run_contact(args)
    elif args.task:
        run_task(args)
    elif args.reanalyze:
        run_reanalyze(args)
    else:
        if not all(ch.isalnum() or ch in "-_" for ch in args.session):
            fail("BAD_SESSION", "Session id may only contain letters, numbers, - and _.", 1)
        run_record(args)


if __name__ == "__main__":
    main()
