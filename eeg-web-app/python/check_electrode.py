"""
Electrode contact diagnostic for Arduino + ExG Pill bio-amplifier.

Run this BEFORE recording:
    python python/check_electrode.py

It reads raw ADC values from the Arduino and shows you in real-time whether
the earbud electrodes (IN+, IN-, GND/REF) are making good skin contact.

Wiring reminder (ExG Pill):
  IN+  → active site  (e.g. right earlobe or temporal scalp)
  IN-  → reference    (e.g. left earlobe or mastoid)
  GND  → body ground  (e.g. bony area like wrist / behind ear)

Press Ctrl+C to stop.
"""

import collections
import sys
import time
from datetime import datetime

import numpy as np
import serial

SERIAL_PORT = "COM3"
BAUD_RATE   = 115200
SR          = 250       # expected samples/sec from Arduino
WINDOW_SEC  = 2         # rolling window for live std computation

# Thresholds derived from empirical recordings (see EEG_Data_new analysis)
STD_GOOD = 4.0          # μV — clear contact
STD_POOR = 2.0          # μV — marginal contact

_SKIP_LINES = frozenset({"EEG Monitoring System Initialized", "Format: timestamp,eeg_value"})


# ---------------------------------------------------------------------------
# Small pure helpers
# ---------------------------------------------------------------------------

def adc_to_uv(raw: float) -> float:
    """Convert 10-bit Arduino ADC count to microvolts (same as eeg_processor)."""
    return raw * (500.0 / 1023.0)


def contact_label(std_uv: float) -> str:
    if std_uv >= STD_GOOD:
        return "GOOD  ✓"
    if std_uv >= STD_POOR:
        return "POOR  ~ (reposition electrode)"
    return "NONE  ✗ (no electrode signal)"


def signal_bar(std_uv: float, width: int = 30) -> str:
    filled = min(int(std_uv / STD_GOOD * width), width)
    return "[" + "#" * filled + "-" * (width - filled) + "]"


def _parse_buffered_line(line: str) -> float | None:
    """Extract ADC value from a 'timestamp,value' line inside BUFFER blocks."""
    try:
        _, val = line.split(",", 1)
        return float(val)
    except ValueError:
        return None


def _parse_plain_line(line: str) -> float | None:
    """Extract ADC value from a bare numeric line."""
    stripped = line.replace(".", "", 1)
    if stripped.lstrip("-").isdigit():
        try:
            return float(line)
        except ValueError:
            pass
    return None


# ---------------------------------------------------------------------------
# Serial helpers
# ---------------------------------------------------------------------------

def _open_serial() -> serial.Serial:
    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        time.sleep(2)
        ser.flushInput()
        print(f"  Connected to Arduino on {SERIAL_PORT}\n")
        return ser
    except serial.SerialException as exc:
        print(f"\n  ERROR: Could not open {SERIAL_PORT}: {exc}")
        print("  Check USB cable and that the correct port is set in SERIAL_PORT.")
        sys.exit(1)


def _read_line(ser: serial.Serial) -> str | None:
    """Read and decode one line; return None on decode error."""
    try:
        return ser.readline().decode("utf-8", errors="replace").strip()
    except Exception:
        return None


def _extract_raw(line: str, inside_buffer: bool) -> float | None:
    """Return the ADC float from a serial line, or None if unparseable."""
    if inside_buffer and "," in line:
        return _parse_buffered_line(line)
    return _parse_plain_line(line)


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------

def _print_header() -> None:
    print("=" * 60)
    print("  EEG Electrode Contact Checker")
    print("=" * 60)
    print(f"  Port: {SERIAL_PORT}  |  Baud: {BAUD_RATE}")
    print()
    print("  Wiring:")
    print("    IN+  → active site  (right earlobe / temporal)")
    print("    IN-  → reference    (left earlobe / mastoid)")
    print("    GND  → body ground  (wrist / bony area)")
    print()
    print(f"  Thresholds (μV): GOOD ≥ {STD_GOOD}  |  POOR ≥ {STD_POOR}  |  NONE < {STD_POOR}")
    print()
    print("  Press Ctrl+C to exit.")
    print("=" * 60)


def _print_status(buf: collections.deque, raw_vals: list) -> None:
    arr = np.array(buf, dtype=float)
    arr -= arr.mean()
    std_uv  = float(np.std(arr))
    mean_raw = float(np.mean(raw_vals[-SR:])) if raw_vals else 0.0

    print(
        f"  {datetime.now().strftime('%H:%M:%S')} | "
        f"ADC_mean={mean_raw:6.1f} | "
        f"std={std_uv:5.2f} uV | "
        f"{signal_bar(std_uv)}  {contact_label(std_uv)}"
    )

    if mean_raw < 50 or mean_raw > 970:
        print("  [!] ADC is railing — signal saturated. Check IN+/IN- polarity and GND.")


# ---------------------------------------------------------------------------
# Main read loop — split into helpers to keep complexity low
# ---------------------------------------------------------------------------

def _handle_line(
    line: str,
    inside_buffer: bool,
    buf: collections.deque,
    raw_vals: list,
) -> tuple[bool, int]:
    """Process one serial line; return (updated inside_buffer, samples_added)."""
    if line == "BUFFER_START":
        return True, 0
    if line == "BUFFER_END":
        return False, 0
    if line in _SKIP_LINES:
        return inside_buffer, 0

    raw = _extract_raw(line, inside_buffer)
    if raw is not None:
        buf.append(adc_to_uv(raw))
        raw_vals.append(raw)
        return inside_buffer, 1
    return inside_buffer, 0


def _tick_display(buf: collections.deque, raw_vals: list, last_print: float) -> float:
    """Print status if a second has elapsed; return updated last_print."""
    now = time.time()
    if now - last_print >= 1.0 and len(buf) >= SR // 2:
        _print_status(buf, raw_vals)
        return now
    return last_print


def _read_loop(ser: serial.Serial) -> None:
    buf: collections.deque = collections.deque(maxlen=SR * WINDOW_SEC)
    raw_vals: list = []
    last_print = time.time()
    inside_buffer = False

    while True:
        if ser.in_waiting > 0:
            line = _read_line(ser)
            if line is not None:
                inside_buffer, _ = _handle_line(line, inside_buffer, buf, raw_vals)

        last_print = _tick_display(buf, raw_vals, last_print)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    _print_header()
    ser = _open_serial()

    try:
        _read_loop(ser)
    except KeyboardInterrupt:
        print("\n\n  Stopped.")
        ser.close()
        sys.exit(0)


if __name__ == "__main__":
    main()
