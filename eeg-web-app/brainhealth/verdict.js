// One plain answer per check: normal, abnormal or unclear.
// Order matters: a noisy recording can't be called either way, a sustained
// seizure-like event outranks everything else, then rhythm slowing.
const PAF_SLOW_HZ = 8;
const THETA_ALPHA_HIGH = 1.5;
const REACTIVITY_WEAK = 1.5;
const MIN_USABLE_PCT = 40;

const num = (x) => typeof x === "number" && Number.isFinite(x);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function computeVerdict(session) {
  const r = session?.eeg?.status === "done" ? session.eeg.result : null;
  if (!r) {
    return { status: "unclear", reasons: [{ key: "no_eeg", text: "No EEG recording in this check." }], action: "record" };
  }
  const q = r.quality || {};
  if (q.grade === "poor" || (num(q.kept_pct) && q.kept_pct < MIN_USABLE_PCT)) {
    return {
      status: "unclear",
      reasons: [{ key: "noisy", text: `Signal too noisy to read (${num(q.kept_pct) ? `${q.kept_pct}% usable` : "poor contact"}).` }],
      action: "record",
    };
  }

  const reasons = [];
  const events = r.seizure_screen?.events || [];
  if (events.length) {
    const where = events.slice(0, 3).map((e) => `${mmss(e.start_s)}–${mmss(e.end_s)}`).join(", ");
    reasons.push({ key: "seizure", text: `Seizure-like activity at ${where}.` });
  }

  const f = r.features || {};
  const metrics = session.evaluation?.metrics || {};
  if (num(f.paf_hz) && f.paf_hz < PAF_SLOW_HZ) {
    reasons.push({ key: "slow_rhythm", text: `Brain rhythm slower than usual (${f.paf_hz.toFixed(1)} Hz, usual 8–12).` });
  } else if (num(f.theta_alpha_ratio) && f.theta_alpha_ratio > THETA_ALPHA_HIGH && num(f.alpha_reactivity) && f.alpha_reactivity < REACTIVITY_WEAK) {
    reasons.push({ key: "slow_waves", text: "More slow waves than usual and a weak eyes-open response." });
  }
  const declined = ["paf_hz", "theta_alpha_ratio", "alpha_reactivity"].filter((id) => metrics[id]?.status === "decline");
  if (declined.length) {
    reasons.push({ key: "rhythm_decline", text: "Brain rhythm changed more than usual since your own earlier checks." });
  }

  if (!reasons.length) {
    return { status: "normal", reasons: [{ key: "normal", text: "No seizure-like activity and brain rhythms in the usual range." }], action: "routine" };
  }
  return { status: "abnormal", reasons, action: "doctor" };
}

module.exports = { computeVerdict, PAF_SLOW_HZ, THETA_ALPHA_HIGH, REACTIVITY_WEAK, MIN_USABLE_PCT };
