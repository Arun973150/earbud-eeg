# Earbud hardware v2: designed for all-day wear

The v1 prototype proves the signal chain:
- dry electrodes in 3D-printed earbuds;
- a BioAmp EXG Pill amplifier and an Arduino Uno, connected to a laptop by USB.

It is fine for a guided 3-minute check, but not comfortable or reliable for hours of everyday wear. v2 targets continuous background screening.

## Design goals

| Area | v1 prototype | v2 target |
|---|---|---|
| Ear tip | Rigid printed shell, flat taped pads | Soft medical-grade silicone tips in S/M/L; foam option for a better seal |
| Electrodes | Flat metal pads on the shell | Conductive-silicone or Ag/AgCl-coated tip electrodes that follow the ear canal (IN+ left, IN− right) |
| Reference | Separate pad below the ear | In-concha contact on the earbud body, so there is nothing extra to wear |
| Weight | Unmeasured; wires pull on the ears | Target under 7 g per earbud |
| Connection | Jumper wires and USB tether | Wireless: Bluetooth Low Energy microcontroller with on-board amplifier and ADC |
| Power | Laptop USB | Rechargeable battery, at least 8 hours of recording; charging case |
| Noise | Long unshielded leads pick up 50 Hz hum | Short shielded traces, front end next to the electrodes, battery power (no mains path) |
| Audio | None | Normal audio driver, so the earbud plays music while it records |

## Safety and standards to meet before clinical use

- **ISO 10993-5/-10:** biocompatibility of all skin-contact materials (tips, electrodes, coatings).
- **IEC 60601-1:** electrical safety. **IEC 60601-1-2:** electromagnetic compatibility.
- **ISO 14971:** risk management. **IEC 62304:** software lifecycle, for the firmware and app.
- Recording only: no current is applied to the body.

## Comfort and wear-time study (before the clinical pilot)

**Participants:** about 30 adult volunteers, including people over 60 and people who wear glasses or hearing aids. Each wears v2 for 2 weeks of normal days.

| Measure | How | Target |
|---|---|---|
| Wear time | Hours of recording per day (from the device) | Median ≥ 4 h/day |
| Comfort | 0–10 comfort scale after each day, plus a short interview at the end | Median ≥ 7, with no pressure pain |
| Usable signal | Share of recorded minutes that pass the clean-minute check | ≥ 50% of worn minutes |
| Fit | Tip size chosen, and how often the earbud fell out | Falls out on fewer than 1 in 10 days |
| Skin | Redness or irritation at the electrodes | None persisting beyond a day |

The results feed the ear-EEG vs scalp-EEG comparison and the DoH-approved pilot in the path to scale.
