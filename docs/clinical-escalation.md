# Clinical escalation pathway

Earbud·EEG is a **screening** tool. It flags risk and change and never diagnoses epilepsy, dementia or any other condition. A qualified clinician decides what a result means. This document defines what happens after each kind of finding, who acts, and by when. The same rules are coded in `eeg-web-app/brainhealth/escalation.js`, `evaluate.js` and `daily.js`, and shown to users in the app at **/escalation**.

## Where findings come from

| Source | What is checked |
|---|---|
| Guided 3-minute check | Seizure screen (CNN-GRU, sustained-event rule); brain-rhythm markers against the person's own baseline (Reliable Change Index); games, mood (PHQ-2/GAD-2) and everyday-function scores |
| Background screening (continuous wear) | Seizure screen over the whole session; daily markers from clean minutes only, compared with the personal baseline and adjusted for that day's sleep and activity |

Days with fewer than 10 clean minutes are not scored. A noisy guided check gives **Unclear**, never **Normal**.

## Tiers

| Tier | Trigger | The person sees | Clinician action | Due by |
|---|---|---|---|---|
| **Info** | One lower day in background screening | It is usually noise; nothing to do | None | – |
| **Repeat** | A drift that sleep or activity mostly explain (at least 60% of the gap); a single unconfirmed decline; a noisy check | Why it probably happened, plus "repeat after three normal nights" | None unless it persists | Guided check within 7 days |
| **Review** | A sustained change habits do not explain (z ≤ −2 on 3 of the last 5 days, or a 7-day mean z ≤ −1.5); a decline confirmed on two checks or in two domains; mood, worry or daily-function scores at threshold | A plain-language reason and "a clinician will review this" | Review the alert and record a decision: no action, repeat (with interval), or referral to primary care, neurology, geriatrics, mental health, audiology or sleep clinic | **7 days** |
| **Urgent** | A sustained seizure-like event (3 or more consecutive 4-s windows above 85%) in a check or in background screening; a rapid drop since the previous check | Safety advice: call **998** (UAE ambulance) or go to the nearest emergency department if they have a seizure, are injured, confused or feel unwell | Top of the queue. Contact the person and decide on urgent referral | **24 hours** |

## Clinician console

- Open alerts are sorted urgent first, then by due date. Each shows the explanation, for example: "Brain rhythm speed 0.6 Hz below usual on 4 of the last 5 days; shorter sleep explains about 0.4 Hz".
- Overdue alerts are highlighted.
- The actions are **Reviewed**, **Escalate to referral**, **Close** and **Reopen**. Each needs no more than one click plus an optional note.
- Every action is stored in the alert's history and in the audit log, with who did it, when, and the note.
- After an alert is handled, the same change is not raised again for 7 days, so people are not alerted twice for one event.

## Safety-netting wording (shown with every alert)

> Background screening, not a diagnosis. If you have a seizure, are injured, confused or feel unwell, call 998 or go to the nearest emergency department.

## Monitoring the pathway

The validation dashboard reports:
- time from flag to clinician review;
- the false-referral burden;
- sensitivity and specificity against a reference assessment.

All of these are broken down by language, age and education, so slow or unfair escalation can be seen and fixed.
