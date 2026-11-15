// Turns raw task data from the browser into metrics. The server scores everything
// so the rules live in one place.
const { THRESHOLDS } = require("./metrics");

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const round = (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
const isNum = (x) => typeof x === "number" && Number.isFinite(x);

function scoreReaction(raw) {
  const trials = Array.isArray(raw?.trials) ? raw.trials : [];
  const valid = trials.map((t) => t.rt).filter((rt) => isNum(rt) && rt >= 150 && rt <= 1500);
  if (valid.length < 8) return {};
  return {
    rt_median_ms: round(median(valid)),
    rt_cv: round(sd(valid) / mean(valid), 3),
  };
}

function scorePattern(raw) {
  const trials = Array.isArray(raw?.trials) ? raw.trials : [];
  const seconds = Number(raw?.durationSec);
  if (!trials.length || !(seconds > 0)) return {};
  const correct = trials.filter((t) => t.correct === true).length;
  return { pattern_correct_per_min: round(correct / (seconds / 60), 1) };
}

// Corsi-style span: the longest sequence length with at least one correct trial.
function scoreMemory(raw) {
  const trials = Array.isArray(raw?.trials) ? raw.trials : [];
  const correctLengths = trials.filter((t) => t.correct === true && isNum(t.length)).map((t) => t.length);
  if (!trials.length) return {};
  return { memory_span: correctLengths.length ? Math.max(...correctLengths) : 0 };
}

function scoreHearing(raw) {
  const trials = Array.isArray(raw?.trials) ? raw.trials : [];
  if (trials.length < 6) return { hearing: null };
  const missesIn = (ear) => trials.filter((t) => t.ear === ear && !t.heard).length;
  const left = missesIn("left");
  const right = missesIn("right");
  return {
    hearing_misses: left + right,
    hearing: { misses_left: left, misses_right: right, wrong_ear: trials.filter((t) => t.heard && !t.correctEar).length },
  };
}

const answer = (x) => (Number.isInteger(x) && x >= 0 && x <= 3 ? x : null);

function scoreMood(raw) {
  const phq = (raw?.phq2 || []).map(answer);
  const gad = (raw?.gad2 || []).map(answer);
  const out = {};
  if (phq.length === 2 && phq.every((x) => x !== null)) out.phq2 = phq[0] + phq[1];
  if (gad.length === 2 && gad.every((x) => x !== null)) out.gad2 = gad[0] + gad[1];
  return out;
}

// 8 everyday tasks: 0 = no more difficulty, 1 = a little more, 2 = much more, null = n/a
function scoreFunction(raw) {
  const items = raw?.items && typeof raw.items === "object" ? Object.values(raw.items) : [];
  const answered = items.filter((x) => x === 0 || x === 1 || x === 2);
  if (!answered.length) return {};
  return { function_score: answered.reduce((a, b) => a + b, 0), function_informant: raw.informant || "self" };
}

function confounders(context = {}) {
  const found = [];
  if (context.fasting) found.push("fasting");
  if (context.unwell) found.push("unwell");
  if (isNum(context.sleepHours) && context.sleepHours < THRESHOLDS.confoundedSleepHours) found.push("short_sleep");
  return found;
}

function eegMetrics(eeg) {
  const f = eeg?.result?.features;
  if (!f) return {};
  const out = {};
  if (isNum(f.paf_hz)) out.paf_hz = f.paf_hz;
  if (isNum(f.theta_alpha_ratio)) out.theta_alpha_ratio = f.theta_alpha_ratio;
  if (isNum(f.alpha_reactivity)) out.alpha_reactivity = f.alpha_reactivity;
  return out;
}

function scoreSession(raw = {}, eeg = null) {
  return {
    ...scoreReaction(raw.reaction),
    ...scorePattern(raw.pattern),
    ...scoreMemory(raw.memory),
    ...scoreHearing(raw.hearing),
    ...scoreMood(raw.mood),
    ...scoreFunction(raw.function),
    ...eegMetrics(eeg),
  };
}

module.exports = {
  scoreSession, scoreReaction, scorePattern, scoreMemory, scoreHearing, scoreMood, scoreFunction,
  confounders, mean, sd, median, round,
};
