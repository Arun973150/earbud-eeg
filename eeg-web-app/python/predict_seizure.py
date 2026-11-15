import os
import sys
import json

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")

import numpy as np
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend for server environment
import matplotlib.pyplot as plt
from scipy.signal import welch
import joblib
import mne
from tensorflow.keras.models import load_model

mne.set_log_level("WARNING")

DEFAULT_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "EEG_Data_new")
WINDOW_SECONDS = 4
WINDOW_OVERLAP = 0.5
MODEL_INPUT_SAMPLES = 125

# A seizure lasts tens of seconds or more, so only sustained runs of high-probability
# windows count as an event; single-window spikes are reported but not flagged.
EVENT_THRESHOLD = 0.85
EVENT_MIN_WINDOWS = 3
EVENT_MERGE_GAP = 2
RULE_TEXT = (f"Flagged only when {EVENT_MIN_WINDOWS} or more consecutive 4-second windows are above "
             f"{int(EVENT_THRESHOLD * 100)}%; single-window spikes are counted but not flagged.")


def find_events(probabilities, step_s=WINDOW_SECONDS * (1 - WINDOW_OVERLAP), window_s=WINDOW_SECONDS):
    """Runs of >= EVENT_MIN_WINDOWS windows above EVENT_THRESHOLD, merging runs separated by
    <= EVENT_MERGE_GAP lower windows. Returns (events, isolated_spike_count)."""
    runs, start = [], None
    for i, p in enumerate(list(probabilities) + [0.0]):
        if p > EVENT_THRESHOLD and start is None:
            start = i
        elif p <= EVENT_THRESHOLD and start is not None:
            runs.append([start, i - 1])
            start = None
    sustained = [r for r in runs if r[1] - r[0] + 1 >= EVENT_MIN_WINDOWS]
    isolated = sum(b - a + 1 for a, b in runs if b - a + 1 < EVENT_MIN_WINDOWS)
    merged = []
    for run in sustained:
        if merged and run[0] - merged[-1][1] - 1 <= EVENT_MERGE_GAP:
            merged[-1][1] = run[1]
        else:
            merged.append(list(run))
    events = [{
        "start_s": round(a * step_s, 1),
        "end_s": round(b * step_s + window_s, 1),
        "peak": round(float(max(probabilities[a:b + 1])), 4),
        "windows": b - a + 1,
    } for a, b in merged]
    return events, isolated

_EXCLUDED = ("ecg", "ekg", "emg", "eog", "resp", "spo2", "pulse", "status", "annotation", "event")
_TEMPORAL = ("t3", "t4", "t5", "t6", "t7", "t8", "temporal")


def pick_channel(names):
    """Prefer a temporal-lobe channel, then any EEG channel; never ECG/EMG/EOG."""
    usable = [c for c in names if not any(x in c.lower() for x in _EXCLUDED)]
    for c in usable:
        if any(t in c.lower() for t in _TEMPORAL):
            return c
    for c in usable:
        if "eeg" in c.lower():
            return c
    return usable[0] if usable else None


class SeizurePredictor:
    def __init__(self, model_dir=DEFAULT_MODEL_DIR):
        model_path = os.path.join(model_dir, "cnn_gru_seizure_model.h5")
        scaler_path = os.path.join(model_dir, "feature_scaler.pkl")
        if not (os.path.exists(model_path) and os.path.exists(scaler_path)):
            raise FileNotFoundError(
                f"Trained model not found in {model_dir} (need cnn_gru_seizure_model.h5 and feature_scaler.pkl)"
            )
        print(f"Loading CNN-GRU model from {model_path}")
        self.model = load_model(model_path, compile=False)
        self.scaler = joblib.load(scaler_path)

    def extract_temporal_lobe_data(self, file_path):
        print(f"Reading EDF file: {file_path}")
        raw = mne.io.read_raw_edf(file_path, preload=True)
        print(f"Available channels: {raw.ch_names}")
        channel = pick_channel(raw.ch_names)
        if channel is None:
            raise ValueError("No EEG channel found in this file")
        print(f"Using channel: {channel}")
        signals = np.nan_to_num(raw.get_data(picks=channel))
        return signals, raw.info["sfreq"], channel

    def extract_features(self, signals, fs):
        window_length = int(WINDOW_SECONDS * fs)
        step = int(window_length * (1 - WINDOW_OVERLAP))
        if signals.shape[1] < window_length:
            return None
        sequences = []
        for i in range(0, signals.shape[1] - window_length + 1, step):
            window = signals[0, i:i + window_length]
            resampled = np.interp(
                np.linspace(0, 1, MODEL_INPUT_SAMPLES),
                np.linspace(0, 1, window.shape[0]),
                window,
            )
            sequences.append(resampled[:, np.newaxis])
        return np.nan_to_num(np.array(sequences))

    def predict(self, edf_file, output_dir=None):
        """Score every 4-second window and flag sustained high-probability runs (see find_events)."""
        signals, fs, channel = self.extract_temporal_lobe_data(edf_file)
        X = self.extract_features(signals, fs)
        if X is None or len(X) == 0:
            raise ValueError(f"Recording is shorter than one {WINDOW_SECONDS}-second analysis window")

        X_scaled = self.scaler.transform(X.reshape(-1, X.shape[-1])).reshape(X.shape)
        probabilities = self.model.predict(X_scaled, verbose=0).flatten()
        above = probabilities > 0.5
        fraction_above = float(np.mean(above))
        max_prob = float(np.max(probabilities))
        events, isolated = find_events(probabilities.tolist())
        has_seizure = bool(events)

        visualization = None
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            name = os.path.splitext(os.path.basename(edf_file))[0]
            visualization = os.path.join(output_dir, f"{name}_prediction.png")
            self._create_prediction_visualization(signals, fs, probabilities, events, visualization)

        return {
            "file": os.path.basename(edf_file),
            "channel": channel,
            "fs": float(fs),
            "duration_s": round(signals.shape[1] / fs, 2),
            "windows": int(len(probabilities)),
            "windows_above_threshold": int(np.sum(above)),
            "fraction_above_threshold": round(fraction_above, 4),
            "probability_max": round(max_prob, 4),
            "probability_mean": round(float(np.mean(probabilities)), 4),
            "decision": "SEIZURE" if has_seizure else "NO SEIZURE",
            "events": events,
            "isolated_spikes": isolated,
            "rule": RULE_TEXT,
            "window_seconds": WINDOW_SECONDS,
            "window_step_s": WINDOW_SECONDS * (1 - WINDOW_OVERLAP),
            "window_probabilities": [round(float(p), 4) for p in probabilities],
            "visualization": visualization,
        }

    def _create_prediction_visualization(self, signals, fs, probabilities, events, output_file):
        print(f"Creating visualization and saving to {output_file}")
        ink, ash, ember, line = "#ffffff", "#858585", "#d9963f", "#2a2d2d"
        plt.rcParams.update({
            "figure.facecolor": "#0b0b0b", "axes.facecolor": "#0b0b0b",
            "axes.edgecolor": line, "axes.labelcolor": ash, "text.color": ink,
            "xtick.color": ash, "ytick.color": ash, "grid.color": line, "font.size": 9,
        })
        fig, axes = plt.subplots(4, 1, figsize=(12, 10))
        time = np.arange(signals.shape[1]) / fs

        axes[0].plot(time, signals[0], color=ink, linewidth=0.7)
        axes[0].set_title("EEG signal (selected channel)", loc="left")
        axes[0].set_xlabel("Time (s)")

        chunk = min(int(fs * 5), signals.shape[1])
        freqs, psd = welch(signals[0, :chunk], fs, nperseg=min(1024, chunk))
        axes[1].semilogy(freqs, psd, color=ink, linewidth=1)
        axes[1].axvspan(8, 13, color=ember, alpha=0.15)
        axes[1].set_xlim([0, min(60, fs / 2)])
        axes[1].set_title("Power spectral density (alpha band shaded)", loc="left")
        axes[1].set_xlabel("Frequency (Hz)")

        axes[2].specgram(signals[0], NFFT=256, Fs=fs, noverlap=128, cmap="magma")
        axes[2].set_ylim([0, min(60, fs / 2)])
        axes[2].set_title("Spectrogram", loc="left")
        axes[2].set_xlabel("Time (s)")

        step = WINDOW_SECONDS * (1 - WINDOW_OVERLAP)
        window_times = np.arange(len(probabilities)) * step + WINDOW_SECONDS / 2
        axes[3].plot(window_times, probabilities, color=ember, linewidth=2, marker="o", markersize=4)
        axes[3].axhline(y=0.5, color=ash, linestyle="--", linewidth=1)
        axes[3].axhline(y=0.85, color=ink, linestyle=":", linewidth=1)
        axes[3].set_ylim([-0.05, 1.05])
        for ev in events:
            for ax in (axes[0], axes[3]):
                ax.axvspan(ev["start_s"], ev["end_s"], color="#d03b3b", alpha=0.25)
            axes[3].text(ev["start_s"], 1.0, f'{ev["start_s"] / 60:.0f}:{ev["start_s"] % 60:02.0f}', color=ink, fontsize=8, va="bottom")
        axes[3].set_title(f"Seizure probability per 4 s window · {len(events)} sustained event(s) shaded (dashed 0.5, dotted 0.85)", loc="left")
        axes[3].set_xlabel("Time (s)")

        for ax in axes:
            ax.spines[["top", "right"]].set_visible(False)
        fig.tight_layout()
        fig.savefig(output_file, dpi=100)
        plt.close(fig)
        print(f"Visualization saved to: {output_file}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python predict_seizure.py <edf_file_path> [output_directory]")
        sys.exit(1)

    edf_file = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else "EEG_Data_new"

    try:
        result = SeizurePredictor().predict(edf_file, output_dir=output_dir)
    except FileNotFoundError as e:
        print(f"ERROR_JSON {json.dumps({'code': 'MODEL_MISSING', 'message': str(e)})}", flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR_JSON {json.dumps({'code': 'UNREADABLE', 'message': str(e)})}", flush=True)
        sys.exit(1)

    print(f"Prediction for {edf_file}:")
    print(f"Result: {result['decision']}")
    print(f"Highest window probability: {result['probability_max']:.2%}")
    print(f"Visualization saved to: {result['visualization']}")
    print(f"RESULT_JSON {json.dumps(result)}", flush=True)


if __name__ == "__main__":
    main()
