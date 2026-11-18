# Earbud·EEG

## Brain health, protected earlier

Earbud·EEG is an earbud-shaped EEG with dry electrodes inside the ear canal. A three-minute check records your brain's rhythm and shows it back to you, explained: a clear seizure-screen verdict, your raw brainwaves, your rhythm bands and a spectrogram. An optional ten-minute check adds speed, memory, hearing and mood. Results are compared with **your own baseline**, so meaningful change is spotted early. (Music playback is on the roadmap; the current hardware is EEG only.) Every finding becomes a plain-language prevention plan. Anything unusual goes to a clinician before it reaches you as a referral.

Built for **Population Health · Challenge 08: Protecting Brain Health Earlier**.

---

## How it works

```text
Dry Ag/AgCl electrodes in the ear canal
        │  temporal-lobe EEG
        ▼
BioAmp EXG Pill ── amplifies the microvolt signal
        ▼
Arduino Uno ── 10-bit ADC, ~250 Hz, USB serial @ 115200 (port auto-detected)
        ▼
python/brain_check.py ── 50 Hz notch, 0.5–45 Hz band-pass, eyes-closed / eyes-open protocol,
        │                artifact rejection, quality grade, EDF file, CNN-GRU seizure screen
        ▼
Express server ── scoring, personal-baseline change detection, risk context,
        │         clinician review queue, validation metrics (local JSON store)
        ▼
React app ── landing page, brain check, reports, trends, clinician and validation pages
```

**The check (about 3 minutes):**
1. **Who's checking?** Pick your name, or add a name and birth year. Consent is a single "I agree" the first time.
2. **Fit the earbud.** A live brainwave trace and contact meter. After about 2 s of good contact it counts down and starts by itself.
3. **Record.** 60 s eyes closed, a chime, then 60 s eyes open.
4. **One answer.** The result page shows **NORMAL**, **ABNORMAL** or **UNCLEAR**, then 4 tiles (seizure, brain rhythm, eyes-open response, signal), then the 4 classic plots: EEG signal, power spectrum with shaded bands, spectrogram, and seizure probability with the 50% and 85% lines.

**Optional add-on, "Add memory & focus" (4 minutes):** 20 s relax, then reaction time, same-or-different and pattern memory while the earbud keeps recording, then 4 mood taps. The report adds per-game brain cards (alpha drop / theta rise = focus) and memory and speed against the person's own range.

### The Normal / Abnormal rule (`brainhealth/verdict.js`)
| Answer | When |
|---|---|
| **Unclear** | Signal graded poor, or less than 40% of it usable |
| **Abnormal** | A sustained seizure-like event (3+ consecutive 4-s windows above 85%), **or** peak alpha below 8 Hz, **or** theta/alpha above 1.5 with a weak eyes-open response, **or** a reliable decline in brain rhythm against the person's own baseline |
| **Normal** | Everything else |

Slowing is described as "linked to memory decline", never as a diagnosis.

---

## Continuous screening, habits and explainable alerts

**Background screening.** Wear the earbud while you study or listen, for 30 minutes to a few hours.
- The app analyses each minute and keeps only the still, clean ones; minutes with walking, chewing or talking are rejected.
- The CNN-GRU seizure screen runs over the whole session.
- Each session is saved as an encrypted EDF plus a daily summary.

**Daily habits.** A 20-second check-in (sleep hours and quality, active minutes, stress), or a CSV export from a phone or watch with flexible columns. Steps are converted to active minutes.

**Explainable alerts** (`brainhealth/daily.js`):
- Each day's markers are compared with the person's own two-week baseline.
- A small per-person model learns how much that person's sleep and activity move each marker, so every alert can say why. For example: *"Brain rhythm speed 0.6 Hz below your usual on 4 of the last 5 days. Shorter sleep (4.4 h vs your usual 8.5 h) explains about 0.6 Hz of this."*
- Changes that habits explain become a **Repeat**. Unexplained sustained changes go to **Clinician review** within 7 days. Sustained seizure-like events are **Urgent**, reviewed within 24 hours.
- The full pathway is in [docs/clinical-escalation.md](docs/clinical-escalation.md) and in the app at `/escalation`.

**Encrypted at rest** (`brainhealth/secure.js`):
- The local store and every EEG recording are encrypted with AES-256-GCM.
- The key is wrapped with Windows DPAPI, so it is tied to the Windows user account; other systems use `EEG_PASSPHRASE` with scrypt.
- Recordings are decrypted only when downloaded.

**Hardware v2 for all-day wear:** soft silicone tips, conductive-silicone electrodes, wireless and battery. See [docs/hardware-v2.md](docs/hardware-v2.md).

The CNN-GRU still does the seizure screening. Sleep and activity are cross-referenced by a transparent per-person model, so every alert is explainable. A learned multimodal model needs labelled continuous data first, which the pilot will collect.

## How each challenge criterion is met

| Criterion | What Earbud·EEG does | Where to see it |
|---|---|---|
| **1. Culturally valid, accessible assessment** | Wordless tasks (lights, shapes, tones, resting EEG), each with a practice round. Read-aloud instructions, large-text and high-contrast modes, large buttons and full keyboard control, larger stimuli for low vision. A helper can sit in, and an informant can answer the daily-life questions. Language, education, age and digital familiarity are recorded so performance can be compared across groups. | `/app` → a check |
| **2. Longitudinal change detection** | Personal baseline = first 3 valid, unconfounded checks. A Reliable Change Index for each measure. Clear thresholds: repeat in 14 days for a one-off decline; clinician review when a decline is confirmed on the next check or appears in 2 domains at once; urgent review for rapid change since the last check. Fasting, illness and short sleep turn a borderline flag into a repeat. **Background screening** adds daily markers against a two-week personal baseline, with sustained-change rules. | Report, Trends, Background screening |
| **3. Integrated risk context** | A health profile (body, metabolic, sleep, mood, lifestyle, head injury, senses, family history, optional APOE with its own consent), mapped to the 14 modifiable risk factors of the Lancet Commission 2024, plus the CAIDE midlife dementia risk score. **Daily sleep and activity** (check-in or CSV import) are cross-referenced with EEG, so each alert says how much habits explain. | Health profile, Today card |
| **4. Personalised prevention and timely care** | Plain-language report: what changed, what it does and doesn't mean, evidence-linked actions for each risk factor, when to retest, and who to see (primary care, neurology, geriatrics, mental health, audiology, sleep clinic). An optional AI explainer limited to the results of that check. | Report |
| **5. Safety and human oversight** | A "risk check, not a diagnosis" message on every report. Personal ranges shown as uncertainty bands. EEG quality gating, and accuracy limits disclosed. People see their result straight away; every Abnormal or review result is also **queued automatically for a clinician's second look** in the staff console (footer link). Clinician decisions appear on the report as a doctor's note. **Documented escalation pathway** with tiers and response times (urgent 24 h, review 7 days), overdue tracking and a logged action history. Data **encrypted at rest** (AES-256-GCM, DPAPI-protected key). Audit log. | `/clinician`, `/escalation` |
| **6. Validation and local performance** | A live dashboard: completion, test–retest ICC, sensitivity, specificity, PPV, time from onset to flag, false-referral burden and days to clinical review, each broken down by first language, age and education. A random 20% verification sample measures specificity honestly. Includes a proposed local validation study. | `/validation` |

---

## Running it

You need Node.js 18+ and Python 3.10–3.12. Everything runs offline on one laptop; MongoDB is not needed.

```bash
# 1. Python environment for the signal pipeline (one-off, about 600 MB)
cd eeg-web-app
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt      # macOS/Linux: .venv/bin/python

# 2. Server dependencies, the simulated demo cohort, and the tests
npm install
npm run seed      # 60 SIMULATED participants with up to two years of checks
npm run reanalyze # (server stopped) add the latest report visuals to older real recordings
npm test                                   # 40 tests
.venv\Scripts\python python/test_monitor.py   # background-screening mode (about 1 min)

# 3. Build the web app and start the server
cd ..
npm install
npm start         # builds the React app, then serves everything on http://localhost:3000
```

The server finds `eeg-web-app/.venv` on its own. Optional settings go in `eeg-web-app/.env`:

| Variable | Default | Purpose |
|---|---|---|
| `CLINICIAN_PIN` | `1234` | PIN for the clinician pages (demo only; real use needs hospital sign-in) |
| `OPENAI_API_KEY` | none | Turns on the restricted AI explainer on reports |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model used by the explainer |
| `EEG_PORT` | auto | Force a serial port, for example `COM5` |
| `MAINS_HZ` | `50` | Mains frequency for the notch filter (50 in India and the UAE) |
| `SESSION_SECRET` | dev value | Cookie signing secret |
| `PYTHON_BIN` | `.venv` | Path to a different Python |

For front-end development, run `npm run dev` in the root (Vite on port 5173) while the server runs on port 3000. Vite forwards API calls to the server.

### With the earbud

1. Plug in the Arduino. The app picks the port by its USB ID (Arduino and CH340 boards), so you don't need to know the COM number. On the development laptop, COM3 is a Bluetooth port, which is why a hard-coded COM3 failed.
2. In the check, choose **Earbud**. Run **Check contact** and wait for "Good contact" (4 µV or more; the same thresholds as `python/check_electrode.py`).
3. The recording measures the real sampling rate and resamples if it is more than 5% off 250 Hz. Peak alpha frequency depends on this.
4. If the earbud isn't connected, the app says so and offers a clearly labelled simulated signal, or lets you skip EEG for that check.

---

## Demo script for judges (about 6 minutes)

1. **Landing page:** the problem and how it works. Click **Try now**.
2. **EEG check:** add yourself (name and birth year), tap **I agree, start**, fit the earbud and watch the live wave turn green. Record for 2 minutes. The result opens on one word (NORMAL / ABNORMAL / UNCLEAR) with the 4 plots.
3. **Add memory & focus:** play the 3 games with the earbud in. The report shows whether your brain switched into focus mode during each game.
4. **Abnormal example:** **Upload EEG file** with a long scalp EDF. Seizure-like stretches are shaded red on the probability plot.
5. **Over time:** open **SIM-008**. Its history dots and **Trends** show change against the person's own baseline.
6. **Human oversight:** footer → **Clinician console** (PIN 1234). Abnormal checks are already queued. Record a decision, and it appears on the report as a doctor's note.
7. **Validation:** completion, sensitivity, specificity, false referrals and time to review by language, age and education. Local test–retest reliability replaces the published defaults. The page also shows a proposed Abu Dhabi validation study.

---

## How change is decided

For each measure, after three baseline checks:

`RCI = direction × (today − baseline mean) / (SD × √(2 × (1 − r)))`

`SD` is the between-person standard deviation and `r` is test–retest reliability. Both start from published defaults (`eeg-web-app/brainhealth/metrics.js`). Once there are 20 or more retest pairs, `r` switches to the program's own ICC.

| RCI | Status |
|---|---|
| above −1.5 | within usual range |
| −1.5 to −1.96 | slightly off |
| −1.96 or lower | below usual range |

| Outcome | Rule |
|---|---|
| **Urgent review** | Seizure screen positive (on good-quality EEG), or a drop of RCI −3 or more *since the previous check* in two domains |
| **Clinician review** | A decline confirmed on two checks in a row; declines in two domains at once; daily-function score of 4 or more; PHQ-2 or GAD-2 of 3 or more |
| **Repeat in 14 days** | A single unconfirmed decline; two or more "slightly off" measures; poor EEG quality; 3 or more missed tones in one ear; or a confounded check that would otherwise be reviewed for a two-domain decline |
| **Building baseline** | Fewer than three valid checks so far |
| **Steady** | Otherwise. Next check in 90 days (age 65+ or 3+ risk factors), else 180 days |

The rules are pure functions in `brainhealth/evaluate.js`, covered by `npm test`.

---

## Safety and limits

- **Not a diagnosis.** It identifies risk and change. Clinicians decide what results mean.
- **Provisional thresholds.** The variation allowances come from published studies until local data replaces them, and they need local validation.
- **EEG markers.** Peak alpha frequency, theta/alpha balance and alpha reactivity are research markers of slowing, not diagnostic tests. They are only used on good-quality signals.
- **Seizure model.** 96.1% sensitivity and 95.3% specificity on scalp-EEG test data. Not yet validated on ear-EEG or in this population. The app shows the raw model probability.
- **Hearing check.** Not calibrated. It compares the person with themselves over time.
- **Simulated data.** The cohort is generated with the same reliability assumptions as the algorithm, so its validation numbers are optimistic. It is tagged SIMULATED everywhere.
- **English-only interface (for now).** The tasks need no reading. All participant-facing wording is in `src/copy.js`, ready for Arabic translation and right-to-left layout.
- **Local data only.** Everything is stored in `eeg-web-app/data/store.json`, and nothing leaves the machine except questions sent to the optional AI explainer.

---

## Repository layout

| Path | Contents |
|---|---|
| `src/pages/` | Landing page, participant pages (home, consent, profile, check, report, trends, EDF screen), clinician and validation pages |
| `src/check/` | The check: task stage, reaction/pattern/memory/hearing tasks, EEG step, questionnaires |
| `src/components/` | Nav, footer, particle brain, cards, charts, shared UI |
| `src/copy.js` | All participant-facing wording |
| `eeg-web-app/app.js`, `api.js`, `jobs.js` | Express server, API routes, Python job runner |
| `eeg-web-app/brainhealth/` | Scoring, change detection, risk, validation, restricted chat, store, simulated cohort, tests |
| `eeg-web-app/python/brain_check.py` | Earbud recording, features, quality, simulated signal |
| `eeg-web-app/python/eeg_processor.py` | Serial acquisition, filtering, EDF writing (also a stand-alone command-line tool) |
| `eeg-web-app/python/predict_seizure.py` | CNN-GRU seizure screen for EDF files |
| `eeg-web-app/python/check_electrode.py` | Stand-alone live electrode contact checker |
| `eeg-web-app/EEG_Data_new/` | Trained model, scaler and sample recordings |

The Arduino firmware is not in this repository yet. Please add the `.ino` sketch so the sampling setup is documented.

---

## Roadmap

- Arabic interface with right-to-left layout; Hindi, Urdu and Malayalam next
- Passive monitoring while listening to music, and sleep EEG overnight
- Auditory P300 through the earbud speaker, a language-free cognitive marker
- Wireless BLE streaming (nRF52840) and on-device inference
- FHIR export and regional health-information-exchange integration
- The local validation study shown on the validation page

## References

- Livingston G, et al. Dementia prevention, intervention, and care: 2024 report of the Lancet standing Commission. *Lancet* 2024.
- Kivipelto M, et al. Risk score for the prediction of dementia risk in 20 years among middle aged people (CAIDE). *Lancet Neurol* 2006;5:735–41.
- Jacobson NS, Truax P. Clinical significance: a statistical approach to defining meaningful change. *J Consult Clin Psychol* 1991.
- Shrout PE, Fleiss JL. Intraclass correlations: uses in assessing rater reliability. *Psychol Bull* 1979.
- Kroenke K, et al. The PHQ-2 (2003) and the GAD-2 (2007).

This is a research and educational prototype, not a certified medical device.
