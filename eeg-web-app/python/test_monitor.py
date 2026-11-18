"""Background screening mode on a simulated 5-minute session.

Run: .venv/Scripts/python python/test_monitor.py
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def run():
    out = tempfile.mkdtemp(prefix="eegmon-")
    proc = subprocess.run(
        [sys.executable, "-u", os.path.join(HERE, "brain_check.py"), "--monitor", "--simulate", "--fast",
         "--max", "300", "--seed", "monitor-test", "--session", "t_monitor", "--out", out],
        capture_output=True, text=True, timeout=600, env={**os.environ, "TF_CPP_MIN_LOG_LEVEL": "2"})
    lines = proc.stdout.splitlines()
    segments = [json.loads(l[8:]) for l in lines if l.startswith("SEGMENT ")]
    result = next(json.loads(l[12:]) for l in lines if l.startswith("RESULT_JSON "))
    return segments, result, out


def main():
    segments, result, out = run()
    assert len(segments) == 5, f"expected 5 minutes, got {len(segments)}"
    clean = [s for s in segments if s["clean"]]
    noisy = [s for s in segments if not s["clean"]]
    assert noisy, "minutes with movement artifacts should be rejected"
    assert clean, "still minutes should be kept"
    for s in clean:
        assert 7 <= s["markers"]["paf_hz"] <= 13, s
    assert result["clean_minutes"] == len(clean)
    assert result["markers"]["paf_hz"] is not None
    assert os.path.exists(os.path.join(out, result["edf_file"]))
    screen = result["seizure_screen"]
    assert screen is not None and screen["events"] == [], "simulated normal EEG must not raise seizure events"
    print(f"ok: {len(clean)} clean / {len(noisy)} rejected minutes, PAF {result['markers']['paf_hz']} Hz, no seizure events")


if __name__ == "__main__":
    main()
