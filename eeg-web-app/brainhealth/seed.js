// Generates a SIMULATED demo cohort so change-over-time and validation can be shown
// without months of real data. Every record is tagged simulated; every check goes
// through the real evaluateSession(), so the flags are what the system would decide.
// Re-running replaces simulated records only; real participants are never touched.
const store = require("./store");
const { METRICS } = require("./metrics");
const { evaluateSession } = require("./evaluate");
const { localReliability } = require("./validation");
const { round } = require("./scoring");

const DAY = 24 * 60 * 60 * 1000;
const COHORT = 60;

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261114);
const uniform = (a, b) => a + (b - a) * rand();
const randint = (a, b) => Math.floor(uniform(a, b + 1));
const chance = (p) => rand() < p;
function weighted(pairs) {
  let x = rand() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [value, w] of pairs) if ((x -= w) <= 0) return value;
  return pairs[pairs.length - 1][0];
}
function normal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Population mean at age 60, change per decade of age, and decline per 90 days
// for people with a simulated true decline.
const MODEL = {
  rt_median_ms: { at60: 330, perDecade: 15, decline: 42, min: 180, max: 900 },
  rt_cv: { at60: 0.17, perDecade: 0.01, decline: 0.025, min: 0.05, max: 0.6 },
  pattern_correct_per_min: { at60: 40, perDecade: -3, decline: -5.5, min: 5, max: 80 },
  memory_span: { at60: 5.4, perDecade: -0.3, decline: -0.65, min: 2, max: 9, integer: true },
  paf_hz: { at60: 9.9, perDecade: -0.15, decline: -0.2, min: 7, max: 12.5 },
  theta_alpha_ratio: { at60: 0.6, perDecade: 0.03, decline: 0.12, min: 0.15, max: 3 },
  alpha_reactivity: { at60: 2.8, perDecade: -0.1, decline: -0.3, min: 1, max: 8 },
};
const CONFOUND_PENALTY = { rt_median_ms: 20, pattern_correct_per_min: -2, memory_span: -0.3 };
const LANGUAGES = [["Arabic", 40], ["English", 22], ["Hindi", 12], ["Urdu", 10], ["Malayalam", 8], ["Tagalog", 8]];

function syntheticSpectra(features) {
  const freqs = [];
  for (let f = 1; f <= 45.001; f += 0.25) freqs.push(round(f, 2));
  const gauss = (f, mu, s) => Math.exp(-0.5 * ((f - mu) / s) ** 2);
  const alphaEc = 9 / features.theta_alpha_ratio;
  const curve = (alpha) => freqs.map((f) => Number((18 / f + alpha * gauss(f, features.paf_hz, 0.9) + 5 * gauss(f, 6, 1.3)).toPrecision(4)));
  return { freqs, eyes_closed: curve(alphaEc), eyes_open: curve(alphaEc / features.alpha_reactivity) };
}

// Relative band powers from the synthetic spectra, so reports can show the band chart.
function bandsFrom(spectra) {
  const bands = { delta: [1, 4], theta: [4, 8], alpha: [8, 13], beta: [13, 30] };
  const power = (curve, lo, hi) => spectra.freqs.reduce((sum, f, i) => (f >= lo && f < hi ? sum + curve[i] : sum), 0);
  const rel = (curve) => {
    const total = power(curve, 1, 30);
    return Object.fromEntries(Object.entries(bands).map(([k, [lo, hi]]) => [k, round(power(curve, lo, hi) / total, 4)]));
  };
  return { relative_power: rel(spectra.eyes_closed), relative_power_open: rel(spectra.eyes_open) };
}

// 29 four-second windows (one minute); a positive case has a burst of high-probability windows.
function seizureWindows(positive) {
  const probs = Array.from({ length: 29 }, () => round(uniform(0.005, 0.12), 4));
  if (positive) {
    const start = randint(8, 20);
    for (let k = 0; k < 5; k++) probs[start + k] = k === 0 || k === 4 ? round(uniform(0.55, 0.8), 4) : round(uniform(0.87, 0.97), 4);
  }
  const above = probs.filter((p) => p > 0.5).length;
  // Same sustained-run rule as predict_seizure.find_events: 3+ consecutive windows above 0.85.
  const events = [];
  for (let i = 0; i < probs.length; ) {
    let j = i;
    while (j < probs.length && probs[j] > 0.85) j++;
    if (j - i >= 3) events.push({ start_s: i * 2, end_s: (j - 1) * 2 + 4, peak: Math.max(...probs.slice(i, j)), windows: j - i });
    i = j > i ? j : i + 1;
  }
  return {
    decision: events.length ? "SEIZURE" : "NO SEIZURE", events, isolated_spikes: 0,
    windows: probs.length, window_seconds: 4, window_step_s: 2,
    window_probabilities: probs, windows_above_threshold: above,
    fraction_above_threshold: round(above / probs.length, 3), probability_max: Math.max(...probs),
  };
}

function makeParticipant(i, now) {
  const age = randint(40, 85);
  const birthYear = new Date(now).getFullYear() - age;
  const sex = chance(0.5) ? "female" : "male";
  const eduBand = weighted([["low", 15], ["mid", 40], ["high", 45]]);
  const educationYears = eduBand === "low" ? randint(0, 6) : eduBand === "mid" ? randint(7, 12) : randint(13, 18);
  const primaryLanguage = weighted(LANGUAGES);
  const digitalFamiliarity = age < 60
    ? weighted([["high", 60], ["medium", 30], ["low", 10]])
    : weighted([["high", 25], ["medium", 40], ["low", 35]]);
  const hearingDifficulty = chance(age < 60 ? 0.1 : age < 75 ? 0.25 : 0.4) ? "yes" : "no";
  const visionDifficulty = chance(age >= 70 ? 0.2 : 0.07) ? "yes" : "no";
  const genomic = chance(0.3);
  const assisted = digitalFamiliarity === "low" && age >= 75 && chance(0.5);
  const heightCm = round(uniform(152, 186), 0);
  const bmi = clamp(28 + normal() * 5, 18, 45);
  const systolicBP = round(clamp(128 + 0.5 * (age - 50) + normal() * 14, 95, 200), 0);

  return {
    id: `p_sim${String(i + 1).padStart(3, "0")}`,
    code: `SIM-${String(i + 1).padStart(3, "0")}`,
    nickname: "",
    simulated: true,
    createdAt: null,
    birthYear, sex, educationYears, primaryLanguage, digitalFamiliarity,
    accommodations: {
      hearing: hearingDifficulty === "yes" && chance(0.5), vision: visionDifficulty === "yes",
      motor: false, readAloud: assisted || visionDifficulty === "yes", assisted,
    },
    consent: {
      version: 1, givenAt: null,
      categories: { eeg: true, tasks: true, questionnaires: true, riskFactors: true, genomic, shareWithClinician: true, shareWithFamily: chance(0.6) },
    },
    risk: {
      heightCm, weightKg: round(bmi * (heightCm / 100) ** 2, 0), systolicBP,
      hypertension: systolicBP > 140 && chance(0.7) ? "yes" : "no",
      activityMinutes: weighted([[0, 15], [30, 15], [60, 15], [90, 15], [150, 20], [210, 12], [300, 8]]),
      diabetes: chance(0.18) ? "yes" : "no",
      totalCholesterol: round(clamp(5.2 + normal(), 3, 9), 1),
      ldl: round(clamp(3.1 + normal() * 0.8, 1, 7), 1),
      sleepHours: round(clamp(6.8 + normal(), 4, 10), 1), sleepQuality: randint(2, 5), snoring: chance(0.25) ? "yes" : "no",
      depression: chance(0.08) ? "yes" : "no", isolated: chance(0.12) ? "yes" : "no",
      smoking: weighted([["never", 70], ["former", 15], ["current", 15]]),
      alcoholUnits: chance(0.85) ? 0 : randint(1, 28),
      airPollution: chance(0.3) ? "yes" : "no", headInjury: chance(0.08) ? "yes" : "no",
      hearingDifficulty, visionDifficulty,
      familyHistory: {
        dementia: chance(0.2) ? "yes" : "no", epilepsy: chance(0.03) ? "yes" : "no",
        stroke: chance(0.15) ? "yes" : "no", parkinsons: chance(0.05) ? "yes" : "no",
      },
      apoe: genomic ? weighted([["none", 70], ["one", 25], ["two", 5]]) : null,
    },
  };
}

function schedule(now, followUps, lastDaysAgo = randint(3, 60)) {
  const offsets = [0, 7, 14];
  for (let k = 1; k <= followUps; k++) offsets.push(14 + k * 91 + randint(-7, 7));
  const start = now - (offsets[offsets.length - 1] + lastDaysAgo) * DAY;
  return offsets.map((d) => ({ day: d, at: start + d * DAY + randint(9, 17) * 60 * 60 * 1000 }));
}

function seed({ now = Date.now() } = {}) {
  const db = store.load();
  db.participants = db.participants.filter((p) => !p.simulated);
  db.sessions = db.sessions.filter((s) => !s.simulated);

  const decliners = new Set();
  while (decliners.size < Math.round(COHORT * 0.15)) decliners.add(randint(0, COHORT - 1));
  const seizureCases = new Set();
  while (seizureCases.size < 2) {
    const i = randint(0, COHORT - 1);
    if (!decliners.has(i)) seizureCases.add(i);
  }

  const people = [];
  for (let i = 0; i < COHORT; i++) {
    const p = makeParticipant(i, now);
    const age = new Date(now).getFullYear() - p.birthYear;
    const urgentDemo = i === [...seizureCases][0];
    const visits = schedule(now, decliners.has(i) ? randint(5, 7) : randint(2, 7), urgentDemo ? 2 : undefined);
    p.createdAt = new Date(visits[0].at - DAY).toISOString();
    p.consent.givenAt = p.createdAt;

    const trait = {};
    for (const [id, m] of Object.entries(MODEL)) {
      trait[id] = m.at60 + (m.perDecade * (age - 60)) / 10 + normal() * METRICS[id].sd * 0.9;
    }
    const hearingBase = (age < 60 ? 0.5 : age < 75 ? 1.5 : 3) + (p.risk.hearingDifficulty === "yes" ? 2 : 0);
    const moodProne = chance(0.08);

    let onsetDay = null;
    if (decliners.has(i)) {
      const lastDay = visits[visits.length - 1].day;
      onsetDay = randint(100, Math.max(110, lastDay - 270));
    }
    p.truth = {
      decline: onsetDay !== null,
      onsetAt: onsetDay !== null ? new Date(visits[0].at + onsetDay * DAY).toISOString() : null,
    };

    const sessions = [];
    const seizureVisit = urgentDemo ? visits.length - 1 : seizureCases.has(i) ? randint(3, visits.length - 1) : -1;
    visits.forEach((visit, v) => {
      const startedAt = new Date(visit.at).toISOString();
      const base = { id: `s_sim${String(i + 1).padStart(3, "0")}_${v + 1}`, participantId: p.id, simulated: true, startedAt, raw: null };

      // English-only interface: assume slightly more drop-out for non-English speakers.
      const dropOut = 0.05 + (age >= 75 ? 0.06 : 0) + (p.digitalFamiliarity === "low" ? 0.05 : 0) + (p.primaryLanguage !== "English" ? 0.03 : 0);
      const seizureHere = v === seizureVisit;
      if (v > 0 && !seizureHere && chance(dropOut)) {
        sessions.push({
          ...base, status: "abandoned", abandonedAt: new Date(visit.at + 6 * 60 * 1000).toISOString(),
          abandon: { reason: weighted([["too_long", 30], ["hard_to_understand", 30], ["technical", 20], ["unwell", 10], ["other", 10]]), step: weighted([["eeg", 40], ["pattern", 30], ["memory", 30]]) },
          context: null, eeg: null, metrics: null, evaluation: null, review: null,
        });
        return;
      }

      const confounded = chance(0.1) ? weighted([["fasting", 40], ["unwell", 30], ["short_sleep", 30]]) : null;
      const context = {
        sleepHours: confounded === "short_sleep" ? round(uniform(3, 4.8), 1) : round(clamp(p.risk.sleepHours + normal() * 0.7, 5, 10), 1),
        sleepQuality: randint(2, 5), fasting: confounded === "fasting", unwell: confounded === "unwell",
        caffeine: chance(0.3), assisted: p.accommodations.assisted, volumeNote: "",
      };
      const sinceOnset = onsetDay !== null && visit.day > onsetDay ? (visit.day - onsetDay) / 90 : 0;

      const metrics = {};
      for (const [id, m] of Object.entries(MODEL)) {
        if (METRICS[id].eeg) continue;
        let x = trait[id] + m.decline * sinceOnset + normal() * METRICS[id].sd * Math.sqrt(1 - METRICS[id].r);
        if (confounded && CONFOUND_PENALTY[id]) x += CONFOUND_PENALTY[id];
        x = clamp(x, m.min, m.max);
        metrics[id] = m.integer ? Math.round(x) : round(x, METRICS[id].decimals);
      }
      const earMisses = (bias) => clamp(Math.round(hearingBase / 2 + bias + normal() * 0.8), 0, 6);
      const left = earMisses(0);
      const right = earMisses(chance(0.15) ? 1.5 : 0);
      metrics.hearing_misses = left + right;
      metrics.hearing = { misses_left: left, misses_right: right, wrong_ear: chance(0.2) ? 1 : 0 };
      const moodScore = () => (moodProne ? weighted([[1, 30], [2, 35], [3, 25], [4, 10]]) : weighted([[0, 62], [1, 22], [2, 14], [3, 2]]));
      metrics.phq2 = moodScore();
      metrics.gad2 = moodScore();
      metrics.function_score = clamp(Math.round(sinceOnset * 1.3 + (chance(0.1) ? 1 : 0)), 0, 16);
      metrics.function_informant = sinceOnset > 1 ? "family" : "self";

      let eeg = null;
      if (seizureHere || chance(0.88)) {
        const grade = seizureHere ? "good" : weighted([["good", 82], ["fair", 12], ["poor", 6]]);
        const features = {};
        for (const id of ["paf_hz", "theta_alpha_ratio", "alpha_reactivity"]) {
          const m = MODEL[id];
          const x = trait[id] + m.decline * sinceOnset + normal() * METRICS[id].sd * Math.sqrt(1 - METRICS[id].r);
          features[id] = round(clamp(x, m.min, m.max), METRICS[id].decimals);
        }
        const seizure = seizureWindows(seizureHere);
        eeg = {
          mode: "simulated", status: "done",
          result: {
            source: "simulated", quality: { grade }, protocol: { eyes_closed_s: 30, eyes_open_s: 30 },
            features: { ...features, ...bandsFrom(syntheticSpectra(features)) }, spectra: syntheticSpectra(features),
            seizure_screen: grade === "poor" ? null : seizure,
          },
        };
        Object.assign(metrics, features);
      }

      sessions.push({
        ...base, status: "completed", completedAt: new Date(visit.at + 11 * 60 * 1000).toISOString(),
        context, eeg, metrics, skipped: eeg ? [] : ["eeg"], evaluation: null, review: null,
      });
    });
    people.push({ p, sessions });
  }

  // Reliability is estimated from the cohort's own retest pairs, as it would be for real data.
  const params = localReliability(people.flatMap((x) => x.sessions));

  for (const { p, sessions } of people) {
    const history = [];
    for (const s of sessions) {
      if (s.status !== "completed") continue;
      s.evaluation = evaluateSession({ participant: p, session: s, history, params, now: new Date(s.completedAt) });
      s.evaluation.evaluatedAt = s.completedAt;
      s.review = s.evaluation.requiresReview ? { status: "pending", flaggedAt: s.completedAt } : { status: "not_required" };
      if (s.evaluation.requiresReview) simulateReview(s, p, now);
      history.push(s);
    }
    db.participants.push(p);
    db.sessions.push(...sessions);
  }

  store.flush();
  return { participants: people.length, sessions: people.reduce((n, x) => n + x.sessions.length, 0) };
}

function simulateReview(s, p, now) {
  const delayDays = s.evaluation.outcome === "urgent" ? uniform(0.2, 1.5) : uniform(1, 10);
  const decidedAt = Date.parse(s.completedAt) + delayDays * DAY;
  const ageDays = (now - Date.parse(s.completedAt)) / DAY;
  if (decidedAt > now || (ageDays < 21 && chance(0.75))) return;

  const changeFlag = s.evaluation.reasons.some((r) => ["confirmed_decline", "multi_domain_decline", "rapid_change"].includes(r.key));
  const declining = p.truth.decline && s.completedAt >= p.truth.onsetAt;
  let decision;
  let services = [];
  let referenceOutcome = "not_assessed";
  if (s.evaluation.outcome === "urgent" || (changeFlag && declining)) {
    decision = chance(0.9) ? "refer" : "repeat";
    services = s.evaluation.services;
    if (changeFlag) referenceOutcome = chance(0.8) ? "change_confirmed" : "not_assessed";
  } else if (changeFlag) {
    decision = chance(0.6) ? "no_action" : "repeat";
    referenceOutcome = chance(0.7) ? "no_change" : "not_assessed";
  } else {
    decision = chance(0.7) ? "refer" : "no_action";
    services = decision === "refer" ? s.evaluation.services : [];
  }
  s.review = {
    status: "completed", verification: false, flaggedAt: s.completedAt,
    decidedAt: new Date(decidedAt).toISOString(), decision,
    services: decision === "refer" ? services : [], repeatWeeks: decision === "repeat" ? 2 : null,
    referenceOutcome, notes: "Simulated clinician decision.", reviewer: "Simulated clinician",
  };
}

if (require.main === module) {
  const result = seed();
  console.log(`Seeded SIMULATED cohort: ${result.participants} participants, ${result.sessions} checks -> ${store.FILE}`);
}

module.exports = { seed };
