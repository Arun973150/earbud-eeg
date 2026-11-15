"""Checks for the sustained-event seizure rule. Run: .venv/Scripts/python python/test_events.py"""
import os
import sys

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from predict_seizure import find_events  # noqa: E402

CASES = [
    ("isolated single-window spikes are not an event", [0.1, 0.9, 0.1, 0.95, 0.2, 0.1, 0.9, 0.1], 0, 3),
    ("three consecutive high windows are one event", [0.1, 0.9, 0.92, 0.96, 0.2], 1, 0),
    ("sustained runs one window apart merge", [0.9, 0.9, 0.9, 0.1, 0.95, 0.9, 0.96, 0.1], 1, 0),
    ("sustained runs far apart stay separate", [0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.95, 0.9, 0.96], 2, 0),
    ("all low is nothing", [0.01] * 29, 0, 0),
]

failed = 0
for name, probs, n_events, n_isolated in CASES:
    events, isolated = find_events(probs)
    ok = len(events) == n_events and isolated == n_isolated
    failed += not ok
    print(("PASS" if ok else "FAIL"), name, events, isolated)
sys.exit(1 if failed else 0)
