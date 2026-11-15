// Metrics tracked against each person's own baseline.
// sd = between-person SD, r = test-retest reliability. Both are provisional,
// literature-informed defaults; r is replaced by a local estimate once enough
// retest pairs exist (see validation.localReliability).
const METRICS = {
  rt_median_ms: { domain: "speed", direction: -1, sd: 60, r: 0.8, decimals: 0 },
  rt_cv: { domain: "speed", direction: -1, sd: 0.06, r: 0.6, decimals: 3 },
  pattern_correct_per_min: { domain: "speed", direction: 1, sd: 8, r: 0.8, decimals: 1 },
  memory_span: { domain: "memory", direction: 1, sd: 1.0, r: 0.7, decimals: 0 },
  paf_hz: { domain: "rhythm", direction: 1, sd: 0.8, r: 0.9, decimals: 2, eeg: true },
  theta_alpha_ratio: { domain: "rhythm", direction: -1, sd: 0.4, r: 0.8, decimals: 2, eeg: true },
  alpha_reactivity: { domain: "rhythm", direction: 1, sd: 0.8, r: 0.7, decimals: 2, eeg: true },
  hearing_misses: { domain: "hearing", direction: -1, sd: 1.5, r: 0.7, decimals: 0 },
};

const COGNITIVE_DOMAINS = ["speed", "memory"];
const BASELINE_SESSIONS = 3;
const MIN_LOCAL_PAIRS = 20;

const THRESHOLDS = {
  watch: -1.5,
  decline: -1.96,
  improved: 1.96,
  rapid: -3,
  phq2: 3,
  gad2: 3,
  functionScore: 4,
  hearingEarMisses: 3,
  confoundedSleepHours: 5,
};

function defaultParams() {
  const params = {};
  for (const [id, m] of Object.entries(METRICS)) params[id] = { sd: m.sd, r: m.r, source: "default" };
  return params;
}

module.exports = { METRICS, COGNITIVE_DOMAINS, BASELINE_SESSIONS, MIN_LOCAL_PAIRS, THRESHOLDS, defaultParams };
