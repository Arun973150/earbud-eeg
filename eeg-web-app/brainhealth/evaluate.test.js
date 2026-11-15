const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateSession, redactForParticipant } = require("./evaluate");

const participant = { id: "p1", birthYear: new Date().getFullYear() - 60, sex: "female", educationYears: 12, risk: {} };
const steady = { rt_median_ms: 310, pattern_correct_per_min: 40, memory_span: 5 };
let n = 0;

function check(metrics, extra = {}) {
  n += 1;
  return { id: `s${n}`, metrics: { phq2: 0, gad2: 0, ...metrics }, context: {}, ...extra };
}

// Runs sessions through the evaluator in order, like the server does.
function run(sessions) {
  const history = [];
  for (const s of sessions) {
    s.evaluation = evaluateSession({ participant, session: s, history });
    history.push(s);
  }
  return sessions[sessions.length - 1].evaluation;
}

const baseline = () => [
  check({ rt_median_ms: 300, pattern_correct_per_min: 40, memory_span: 5 }),
  check({ rt_median_ms: 310, pattern_correct_per_min: 41, memory_span: 5 }),
  check({ rt_median_ms: 320, pattern_correct_per_min: 39, memory_span: 5 }),
];

test("first three checks build the baseline", () => {
  const ev = run([check(steady), check(steady)]);
  assert.equal(ev.outcome, "baseline");
  assert.equal(ev.metrics.rt_median_ms.status, "baseline");
  assert.equal(ev.nextCheckDays, 7);
});

test("RCI uses the personal baseline and SEdiff = SD * sqrt(2(1 - r))", () => {
  const ev = run([...baseline(), check({ ...steady, rt_median_ms: 400 })]);
  const se = 60 * Math.sqrt(2 * (1 - 0.8));
  assert.equal(ev.metrics.rt_median_ms.baseline, 310);
  assert.equal(ev.metrics.rt_median_ms.rci, Math.round((-(400 - 310) / se) * 100) / 100);
  assert.equal(ev.metrics.rt_median_ms.status, "decline");
});

test("a single unconfirmed decline asks for a repeat in 14 days", () => {
  const ev = run([...baseline(), check({ ...steady, rt_median_ms: 400 })]);
  assert.equal(ev.outcome, "repeat");
  assert.equal(ev.nextCheckDays, 14);
  assert.ok(ev.reasons.some((r) => r.key === "single_decline"));
  assert.equal(ev.requiresReview, false);
});

test("a decline confirmed on the next check goes to clinician review", () => {
  const ev = run([...baseline(), check({ ...steady, rt_median_ms: 400 }), check({ ...steady, rt_median_ms: 405 })]);
  assert.equal(ev.outcome, "review");
  assert.ok(ev.reasons.some((r) => r.key === "confirmed_decline"));
  assert.deepEqual(ev.services, ["primary_care"]);
});

test("declines in two domains at once go to review, unless the check was confounded", () => {
  const both = { ...steady, rt_median_ms: 400, memory_span: 3 };
  assert.equal(run([...baseline(), check(both)]).outcome, "review");
  const confounded = run([...baseline(), check(both, { context: { fasting: true } })]);
  assert.equal(confounded.outcome, "repeat");
  assert.ok(confounded.reasons.some((r) => r.key === "confounded"));
});

test("confounded checks don't count toward the baseline", () => {
  const ev = run([check(steady, { context: { unwell: true } }), check(steady), check(steady), check(steady)]);
  assert.equal(ev.outcome, "baseline");
  assert.equal(ev.metrics.rt_median_ms.status, "baseline");
});

test("a sudden large drop in two domains since the last check is urgent; slow drift is not", () => {
  const sudden = run([...baseline(), check(steady), check({ ...steady, rt_median_ms: 460, memory_span: 2 })]);
  assert.equal(sudden.outcome, "urgent");
  assert.ok(sudden.reasons.some((r) => r.key === "rapid_change"));

  const drift = [...baseline()];
  for (const [rt, span] of [[360, 4], [400, 3], [440, 2], [470, 2]]) drift.push(check({ ...steady, rt_median_ms: rt, memory_span: span }));
  const last = run(drift);
  assert.equal(last.outcome, "review");
  assert.ok(!last.reasons.some((r) => r.key === "rapid_change"));
});

test("mood screen at or above the cut-off goes to review even during baseline", () => {
  const ev = run([check({ ...steady, phq2: 3 })]);
  assert.equal(ev.outcome, "review");
  assert.ok(ev.services.includes("mental_health"));
  assert.ok(ev.recommendations.includes("mood"));
});

test("a positive seizure screen is urgent and suggests neurology", () => {
  const eeg = { status: "done", result: { quality: { grade: "good" }, seizure_screen: { decision: "SEIZURE", probability_max: 0.93 } } };
  const ev = run([check(steady, { eeg })]);
  assert.equal(ev.outcome, "urgent");
  assert.ok(ev.services.includes("neurology"));
  assert.equal(ev.nextCheckDays, null);
});

test("poor EEG quality excludes brain-rhythm metrics and asks for a repeat", () => {
  const eeg = { status: "done", result: { quality: { grade: "poor" } } };
  const ev = run([...baseline(), check({ ...steady, paf_hz: 9 }, { eeg })]);
  assert.equal(ev.metrics.paf_hz.status, "excluded");
  assert.equal(ev.outcome, "repeat");
  assert.ok(ev.reasons.some((r) => r.key === "eeg_poor"));
});

test("missing three tones in one ear asks for a repeat and recommends a hearing test", () => {
  const ev = run([...baseline(), check({ ...steady, hearing_misses: 3, hearing: { misses_left: 3, misses_right: 0 } })]);
  assert.equal(ev.outcome, "repeat");
  assert.ok(ev.recommendations.includes("hearing_test"));
  assert.ok(ev.consider.includes("audiology"));
});

test("stable checks are rescheduled at 180 days, or 90 for people 65+", () => {
  assert.equal(run([...baseline(), check(steady)]).nextCheckDays, 180);
  const older = { ...participant, birthYear: new Date().getFullYear() - 70 };
  const history = [];
  let ev;
  for (const s of [...baseline(), check(steady)]) {
    ev = evaluateSession({ participant: older, session: s, history });
    s.evaluation = ev;
    history.push(s);
  }
  assert.equal(ev.outcome, "stable");
  assert.equal(ev.nextCheckDays, 90);
});

test("participants don't see flagged details until a clinician has reviewed them", () => {
  const ev = run([...baseline(), check({ ...steady, rt_median_ms: 400 }), check({ ...steady, rt_median_ms: 405 })]);
  const hidden = redactForParticipant(ev, { status: "pending" });
  assert.equal(hidden.metrics.rt_median_ms.status, "pending");
  assert.equal(hidden.metrics.rt_median_ms.rci, undefined);
  assert.deepEqual(hidden.reasons.map((r) => r.key), ["pending_review"]);
  assert.deepEqual(hidden.services, []);
  assert.equal(redactForParticipant(ev, { status: "completed" }), ev);
});
