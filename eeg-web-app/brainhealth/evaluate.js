// Personal-baseline change detection and the decision rules that turn a check
// into an outcome. Pure functions: everything they need is passed in.
const { METRICS, COGNITIVE_DOMAINS, BASELINE_SESSIONS, THRESHOLDS, defaultParams } = require("./metrics");
const { confounders, mean, round } = require("./scoring");
const { riskSummary, ageOf } = require("./risk");

const DOMAIN_ORDER = ["speed", "memory", "rhythm", "hearing"];
const CHANGE_REASONS = new Set(["confirmed_decline", "multi_domain_decline", "rapid_change"]);

const FACTOR_RECOMMENDATION = {
  hearing_loss: "hearing_test", high_ldl: "ldl", depression: "mood", head_injury: "head_protection",
  physical_inactivity: "activity", diabetes: "diabetes", smoking: "smoking", hypertension: "blood_pressure",
  obesity: "weight", excess_alcohol: "alcohol", social_isolation: "social", air_pollution: "air",
  vision_loss: "vision", less_education: "learning",
};

const eegQuality = (session) => session?.eeg?.result?.quality?.grade || null;
const sessionConfounders = (session) => session?.evaluation?.confounders ?? confounders(session?.context);

function usableForBaseline(session, metricId) {
  if (typeof session.metrics?.[metricId] !== "number") return false;
  if (sessionConfounders(session).length) return false;
  if (METRICS[metricId].eeg && eegQuality(session) === "poor") return false;
  return true;
}

function evaluateMetrics(session, history, params) {
  const quality = eegQuality(session);
  const metrics = {};
  for (const [id, def] of Object.entries(METRICS)) {
    const value = session.metrics?.[id];
    if (typeof value !== "number") continue;
    if (def.eeg && quality === "poor") {
      metrics[id] = { value, status: "excluded" };
      continue;
    }
    const usable = history.filter((s) => usableForBaseline(s, id));
    const baseValues = usable.slice(0, BASELINE_SESSIONS).map((s) => s.metrics[id]);
    if (baseValues.length < BASELINE_SESSIONS) {
      metrics[id] = { value, status: "baseline", n: baseValues.length };
      continue;
    }
    const p = params[id] || defaultParams()[id];
    const se = p.sd * Math.sqrt(2 * (1 - p.r));
    const base = mean(baseValues);
    const rci = (def.direction * (value - base)) / se;
    // Change since the previous valid check, to tell rapid change from slow drift.
    const rciPrev = (def.direction * (value - usable[usable.length - 1].metrics[id])) / se;
    const status =
      rci <= THRESHOLDS.decline ? "decline" :
      rci <= THRESHOLDS.watch ? "watch" :
      rci >= THRESHOLDS.improved ? "improved" : "ok";
    const d = def.decimals + 1;
    metrics[id] = {
      value, status, rci: round(rci, 2), rciPrev: round(rciPrev, 2), n: baseValues.length,
      baseline: round(base, d), low: round(base - 1.96 * se, d), high: round(base + 1.96 * se, d),
    };
  }
  return metrics;
}

function domainStatuses(metrics) {
  const domains = {};
  for (const domain of DOMAIN_ORDER) {
    const statuses = Object.entries(metrics)
      .filter(([id, m]) => METRICS[id].domain === domain && m.status !== "excluded")
      .map(([, m]) => m.status);
    if (!statuses.length) continue;
    domains[domain] =
      statuses.includes("decline") ? "decline" :
      statuses.includes("watch") ? "watch" :
      statuses.every((s) => s === "baseline") ? "baseline" : "ok";
  }
  return domains;
}

// A decline is confirmed when the most recent earlier check that measured the
// same domain also showed a decline there.
function previousDomainStatus(history, domain) {
  for (let i = history.length - 1; i >= 0; i--) {
    const status = history[i].evaluation?.domains?.[domain];
    if (status && status !== "baseline") return status;
  }
  return null;
}

function evaluateSession({ participant, session, history = [], params = defaultParams(), now = new Date() }) {
  const confounded = confounders(session.context);
  const quality = eegQuality(session);
  const metrics = evaluateMetrics(session, history, params);
  const domains = domainStatuses(metrics);
  const m = session.metrics || {};
  const risk = riskSummary(participant, m);
  const age = ageOf(participant, now);

  const baselineSessions = Math.min(history.filter((s) => !sessionConfounders(s).length).length, BASELINE_SESSIONS);
  const declineDomains = DOMAIN_ORDER.filter((d) => domains[d] === "decline");
  const confirmedDomains = declineDomains.filter((d) => previousDomainStatus(history, d) === "decline");
  const rapidDomains = DOMAIN_ORDER.filter((d) =>
    Object.entries(metrics).some(([id, x]) =>
      METRICS[id].domain === d && ["decline", "watch"].includes(x.status) && x.rciPrev <= THRESHOLDS.rapid));
  const metricsIn = (ds, statuses) =>
    Object.entries(metrics).filter(([id, x]) => ds.includes(METRICS[id].domain) && statuses.includes(x.status)).map(([id]) => id);

  const screen = session.eeg?.result?.seizure_screen;
  const seizurePositive = screen?.decision === "SEIZURE" && quality !== "poor";
  const earMisses = Math.max(m.hearing?.misses_left ?? 0, m.hearing?.misses_right ?? 0);
  const hearingFlag = earMisses >= THRESHOLDS.hearingEarMisses;
  const moodFlag = (m.phq2 ?? 0) >= THRESHOLDS.phq2;
  const anxietyFlag = (m.gad2 ?? 0) >= THRESHOLDS.gad2;
  const functionFlag = (m.function_score ?? 0) >= THRESHOLDS.functionScore;

  const reasons = [];
  let outcome;
  if (seizurePositive || rapidDomains.length >= 2) {
    outcome = "urgent";
    if (seizurePositive) reasons.push({ key: "seizure_screen", params: { probability: screen.probability_max } });
    if (rapidDomains.length >= 2) reasons.push({ key: "rapid_change", params: { domains: rapidDomains } });
  } else {
    const review = [];
    if (confirmedDomains.length) review.push({ key: "confirmed_decline", params: { domains: confirmedDomains, metrics: metricsIn(confirmedDomains, ["decline"]) } });
    if (declineDomains.length >= 2) review.push({ key: "multi_domain_decline", params: { domains: declineDomains } });
    if (functionFlag) review.push({ key: "function_change", params: { score: m.function_score } });
    if (moodFlag) review.push({ key: "mood_phq2", params: { score: m.phq2 } });
    if (anxietyFlag) review.push({ key: "anxiety_gad2", params: { score: m.gad2 } });
    const onlyMultiDomain = review.length === 1 && review[0].key === "multi_domain_decline";

    if (review.length && !(confounded.length && onlyMultiDomain)) {
      outcome = "review";
      reasons.push(...review);
    } else {
      const repeat = [];
      const single = declineDomains.filter((d) => !confirmedDomains.includes(d));
      if (onlyMultiDomain) repeat.push(review[0]);
      else if (single.length) repeat.push({ key: "single_decline", params: { domains: single, metrics: metricsIn(single, ["decline"]) } });
      const watching = metricsIn(DOMAIN_ORDER, ["watch"]);
      if (watching.length >= 2) repeat.push({ key: "several_watch", params: { count: watching.length, metrics: watching } });
      if (quality === "poor") repeat.push({ key: "eeg_poor", params: {} });
      if (hearingFlag) {
        const ear = (m.hearing.misses_left ?? 0) >= (m.hearing.misses_right ?? 0) ? "left" : "right";
        repeat.push({ key: "hearing_misses", params: { ear, misses: earMisses } });
      }
      if (repeat.length) {
        outcome = "repeat";
        reasons.push(...repeat);
      } else if (baselineSessions < BASELINE_SESSIONS) {
        outcome = "baseline";
        reasons.push({ key: "baseline_building", params: { done: baselineSessions + (confounded.length ? 0 : 1), needed: BASELINE_SESSIONS } });
      } else {
        outcome = "stable";
        reasons.push({ key: "all_within_range", params: {} });
      }
    }
  }
  if (confounded.length) reasons.push({ key: "confounded", params: { factors: confounded } });

  const requiresReview = outcome === "review" || outcome === "urgent";
  const services = new Set();
  if (requiresReview) {
    const cognitiveDecline = declineDomains.some((d) => COGNITIVE_DOMAINS.includes(d)) || functionFlag;
    if (seizurePositive || rapidDomains.length || (declineDomains.includes("rhythm") && cognitiveDecline)) services.add("neurology");
    if (cognitiveDecline) services.add(age !== null && age >= 65 ? "geriatrics" : "primary_care");
    if (moodFlag || anxietyFlag) services.add("mental_health");
    if (confirmedDomains.includes("hearing")) services.add("audiology");
    if (!services.size) services.add("primary_care");
  }

  const present = new Set(risk.factors.filter((f) => f.status === "present").map((f) => f.id));
  const sleepIssue =
    (typeof risk.sleep.hours === "number" && risk.sleep.hours < 6) ||
    (typeof risk.sleep.quality === "number" && risk.sleep.quality <= 2) ||
    (typeof session.context?.sleepHours === "number" && session.context.sleepHours < 6);
  const consider = new Set();
  if (hearingFlag || present.has("hearing_loss")) consider.add("audiology");
  if (sleepIssue && risk.sleep.snoring === "yes") consider.add("sleep_clinic");
  if (["hypertension", "diabetes", "high_ldl", "obesity"].some((f) => present.has(f))) consider.add("primary_care");
  for (const s of services) consider.delete(s);

  const recommendations = [];
  const add = (key) => { if (!recommendations.includes(key)) recommendations.push(key); };
  if (confounded.length) add("retest_rested");
  if (hearingFlag) add("hearing_test");
  if (moodFlag || anxietyFlag) add("mood");
  if (sleepIssue) add("sleep");
  for (const f of risk.factors) if (f.status === "present") add(FACTOR_RECOMMENDATION[f.id]);
  if (!recommendations.length) add("keep_going");

  const nextCheckDays =
    requiresReview ? null :
    outcome === "repeat" ? 14 :
    outcome === "baseline" ? 7 :
    (age !== null && age >= 65) || risk.modifiablePresent >= 3 ? 90 : 180;

  return {
    version: 1,
    evaluatedAt: now.toISOString(),
    outcome,
    requiresReview,
    confounders: confounded,
    eegQuality: quality,
    baselineSessions,
    metrics,
    domains,
    flags: {
      phq2: m.phq2 ?? null, gad2: m.gad2 ?? null, function_score: m.function_score ?? null,
      mood: moodFlag, anxiety: anxietyFlag, function: functionFlag, hearing: hearingFlag,
      seizure: screen ? { decision: screen.decision, probability_max: screen.probability_max } : null,
    },
    reasons,
    services: [...services],
    consider: [...consider],
    recommendations: recommendations.slice(0, 6),
    nextCheckDays,
    params: Object.fromEntries(Object.keys(metrics).map((id) => [id, params[id]])),
  };
}

// Participants see flagged results only after a clinician has reviewed them.
function redactForParticipant(evaluation, review) {
  if (!evaluation || !evaluation.requiresReview || review?.status === "completed") return evaluation;
  const hide = (s) => (["decline", "watch"].includes(s) ? "pending" : s);
  return {
    ...evaluation,
    metrics: Object.fromEntries(Object.entries(evaluation.metrics).map(([id, x]) => {
      const { rci, rciPrev, ...rest } = x;
      return [id, { ...rest, status: hide(x.status) }];
    })),
    domains: Object.fromEntries(Object.entries(evaluation.domains).map(([d, s]) => [d, hide(s)])),
    flags: { ...evaluation.flags, mood: null, anxiety: null, function: null, seizure: evaluation.flags.seizure ? { pending: true } : null },
    reasons: [{ key: "pending_review", params: { urgent: evaluation.outcome === "urgent" } }],
    services: [],
  };
}

const isChangeFlag = (evaluation) =>
  Boolean(evaluation?.requiresReview && evaluation.reasons.some((r) => CHANGE_REASONS.has(r.key)));

module.exports = { evaluateSession, redactForParticipant, isChangeFlag, DOMAIN_ORDER };
