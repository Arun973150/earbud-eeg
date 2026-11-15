// Validation metrics computed live from stored checks (criterion 6).
const { METRICS, BASELINE_SESSIONS, MIN_LOCAL_PAIRS, defaultParams } = require("./metrics");
const { confounders, median, round } = require("./scoring");
const { ageOf } = require("./risk");
const { isChangeFlag } = require("./evaluate");

const DAY = 24 * 60 * 60 * 1000;
const RETEST_MAX_GAP_DAYS = 30;
const MIN_SEGMENT = 10;
const STALE_IN_PROGRESS_MS = 2 * 60 * 60 * 1000;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => sum(xs) / xs.length;
const ratio = (num, den) => (den > 0 ? round(num / den, 3) : null);

// ICC(2,1): two-way random effects, absolute agreement, single measurement (Shrout & Fleiss).
function icc21(pairs) {
  const n = pairs.length;
  const k = 2;
  if (n < 3) return null;
  const all = pairs.flat();
  const grand = mean(all);
  const rowMeans = pairs.map(([a, b]) => (a + b) / 2);
  const colMeans = [mean(pairs.map((p) => p[0])), mean(pairs.map((p) => p[1]))];
  const ssr = k * sum(rowMeans.map((m) => (m - grand) ** 2));
  const ssc = n * sum(colMeans.map((m) => (m - grand) ** 2));
  const sst = sum(all.map((x) => (x - grand) ** 2));
  const msr = ssr / (n - 1);
  const msc = ssc / (k - 1);
  const mse = (sst - ssr - ssc) / ((n - 1) * (k - 1));
  const denom = msr + (k - 1) * mse + (k * (msc - mse)) / n;
  return denom > 0 ? (msr - mse) / denom : null;
}

const completedSessions = (sessions) =>
  sessions.filter((s) => s.status === "completed").sort((a, b) => a.completedAt.localeCompare(b.completedAt));

// Retest pairs: consecutive, unconfounded baseline checks no more than 30 days apart.
function retestPairs(sessions) {
  const byParticipant = new Map();
  for (const s of completedSessions(sessions)) {
    if (!byParticipant.has(s.participantId)) byParticipant.set(s.participantId, []);
    byParticipant.get(s.participantId).push(s);
  }
  const pairs = Object.fromEntries(Object.keys(METRICS).map((id) => [id, []]));
  for (const list of byParticipant.values()) {
    const baseline = list.filter((s) => !confounders(s.context).length).slice(0, BASELINE_SESSIONS);
    for (let i = 1; i < baseline.length; i++) {
      const a = baseline[i - 1];
      const b = baseline[i];
      if ((Date.parse(b.completedAt) - Date.parse(a.completedAt)) / DAY > RETEST_MAX_GAP_DAYS) continue;
      for (const id of Object.keys(METRICS)) {
        const x = a.metrics?.[id];
        const y = b.metrics?.[id];
        if (typeof x !== "number" || typeof y !== "number") continue;
        if (METRICS[id].eeg && [a, b].some((s) => s.eeg?.result?.quality?.grade === "poor")) continue;
        pairs[id].push([x, y]);
      }
    }
  }
  return pairs;
}

// Parameters for the RCI: local test-retest reliability once there are enough pairs.
function localReliability(sessions) {
  const params = defaultParams();
  const pairs = retestPairs(sessions);
  for (const [id, list] of Object.entries(pairs)) {
    const icc = icc21(list);
    params[id].pairs = list.length;
    params[id].icc = icc === null ? null : round(icc, 3);
    if (icc !== null && list.length >= MIN_LOCAL_PAIRS) {
      params[id].r = round(Math.min(0.97, Math.max(0.3, icc)), 3);
      params[id].source = "local";
    }
  }
  return params;
}

function ageBand(participant) {
  const age = ageOf(participant);
  if (age === null) return "Unknown";
  return age < 50 ? "Under 50" : age < 65 ? "50-64" : "65+";
}

function educationBand(participant) {
  const y = participant.educationYears;
  if (typeof y !== "number") return "Unknown";
  return y <= 6 ? "0-6 years" : y <= 12 ? "7-12 years" : "13+ years";
}

// Reference standard: known truth for simulated people; for real people, the
// most recent clinical assessment a clinician recorded.
function reference(participant, sessions) {
  if (participant.simulated) return participant.truth ? participant.truth.decline : null;
  const assessed = sessions
    .filter((s) => s.review?.status === "completed" && ["change_confirmed", "no_change"].includes(s.review.referenceOutcome))
    .sort((a, b) => b.review.decidedAt.localeCompare(a.review.decidedAt));
  return assessed.length ? assessed[0].review.referenceOutcome === "change_confirmed" : null;
}

function summarise(participants, sessionsByParticipant, now) {
  let completed = 0;
  let incomplete = 0;
  const confusion = { tp: 0, fp: 0, tn: 0, fn: 0 };
  const detectionDays = [];
  const reviewDays = [];
  let reviews = 0;
  let noAction = 0;
  let referrals = 0;
  let pending = 0;
  let oldestPendingDays = null;

  for (const p of participants) {
    const sessions = sessionsByParticipant.get(p.id) || [];
    for (const s of sessions) {
      if (s.status === "completed") completed++;
      else if (s.status === "abandoned" || (s.status === "in_progress" && now - Date.parse(s.startedAt) > STALE_IN_PROGRESS_MS)) incomplete++;

      if (s.evaluation?.requiresReview && !s.review?.verification) {
        if (s.review?.status === "completed") {
          reviews++;
          if (s.review.decision === "no_action") noAction++;
          if (s.review.decision === "refer") referrals++;
          reviewDays.push((Date.parse(s.review.decidedAt) - Date.parse(s.completedAt)) / DAY);
        } else if (s.review?.status === "pending") {
          pending++;
          const waited = (now - Date.parse(s.completedAt)) / DAY;
          oldestPendingDays = Math.max(oldestPendingDays ?? 0, waited);
        }
      }
    }

    const truth = reference(p, sessions);
    if (truth === null) continue;
    const flagged = completedSessions(sessions).filter((s) => isChangeFlag(s.evaluation));
    if (truth && flagged.length) confusion.tp++;
    else if (truth) confusion.fn++;
    else if (flagged.length) confusion.fp++;
    else confusion.tn++;
    if (truth && flagged.length && p.truth?.onsetAt) {
      const first = flagged.find((s) => s.completedAt >= p.truth.onsetAt);
      if (first) detectionDays.push((Date.parse(first.completedAt) - Date.parse(p.truth.onsetAt)) / DAY);
    }
  }

  const { tp, fp, tn, fn } = confusion;
  return {
    participants: participants.length,
    completion: { completed, incomplete, rate: ratio(completed, completed + incomplete) },
    detection: {
      ...confusion,
      withReference: tp + fp + tn + fn,
      sensitivity: ratio(tp, tp + fn),
      specificity: ratio(tn, tn + fp),
      ppv: ratio(tp, tp + fp),
      medianDaysToDetect: detectionDays.length ? round(median(detectionDays), 0) : null,
    },
    referrals: {
      reviews,
      falseReferralRate: ratio(noAction, reviews),
      referred: referrals,
      per100Participants: participants.length ? round((100 * referrals) / participants.length, 1) : null,
    },
    timeToReview: {
      reviewed: reviewDays.length,
      medianDays: reviewDays.length ? round(median(reviewDays), 1) : null,
      within7Days: reviewDays.length ? ratio(reviewDays.filter((d) => d <= 7).length, reviewDays.length) : null,
      pending,
      oldestPendingDays: oldestPendingDays === null ? null : round(oldestPendingDays, 1),
    },
  };
}

function segmentBy(participants, sessionsByParticipant, keyOf, now) {
  const groups = new Map();
  for (const p of participants) {
    const key = keyOf(p);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([key, members]) => ({ segment: key, insufficient: members.length < MIN_SEGMENT, ...summarise(members, sessionsByParticipant, now) }));
}

function computeValidation({ participants, sessions, now = Date.now() }) {
  const sessionsByParticipant = new Map();
  for (const s of sessions) {
    if (!sessionsByParticipant.has(s.participantId)) sessionsByParticipant.set(s.participantId, []);
    sessionsByParticipant.get(s.participantId).push(s);
  }
  const languageCounts = new Map();
  for (const p of participants) languageCounts.set(p.primaryLanguage || "Unknown", (languageCounts.get(p.primaryLanguage || "Unknown") || 0) + 1);
  const language = (p) => {
    const lang = p.primaryLanguage || "Unknown";
    return languageCounts.get(lang) >= MIN_SEGMENT ? lang : "Other";
  };

  const params = localReliability(sessions);
  return {
    generatedAt: new Date(now).toISOString(),
    overall: summarise(participants, sessionsByParticipant, now),
    reliability: Object.fromEntries(Object.entries(params).map(([id, p]) => [id, {
      pairs: p.pairs, icc: p.icc, rInUse: p.r, source: p.source, rDefault: METRICS[id].r,
    }])),
    segments: {
      language: segmentBy(participants, sessionsByParticipant, language, now),
      age: segmentBy(participants, sessionsByParticipant, ageBand, now),
      education: segmentBy(participants, sessionsByParticipant, educationBand, now),
    },
    minSegment: MIN_SEGMENT,
    minLocalPairs: MIN_LOCAL_PAIRS,
  };
}

module.exports = { icc21, retestPairs, localReliability, computeValidation, reference };
