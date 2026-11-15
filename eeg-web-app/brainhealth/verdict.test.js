const test = require("node:test");
const assert = require("node:assert/strict");
const { computeVerdict } = require("./verdict");

const session = (result, evaluation = {}) => ({ eeg: { status: "done", result }, evaluation });
const healthy = {
  quality: { grade: "good", kept_pct: 92 },
  features: { paf_hz: 10.1, theta_alpha_ratio: 0.6, alpha_reactivity: 2.4 },
  seizure_screen: { decision: "NO SEIZURE", events: [] },
};

test("no EEG is unclear", () => {
  assert.equal(computeVerdict({}).status, "unclear");
});

test("poor signal is unclear, even with an event", () => {
  const v = computeVerdict(session({ ...healthy, quality: { grade: "poor", kept_pct: 20 }, seizure_screen: { events: [{ start_s: 10, end_s: 30 }] } }));
  assert.equal(v.status, "unclear");
  assert.equal(v.action, "record");
});

test("healthy recording is normal", () => {
  const v = computeVerdict(session(healthy));
  assert.equal(v.status, "normal");
});

test("a sustained seizure-like event is abnormal", () => {
  const v = computeVerdict(session({ ...healthy, seizure_screen: { decision: "SEIZURE", events: [{ start_s: 42, end_s: 58 }] } }));
  assert.equal(v.status, "abnormal");
  assert.equal(v.reasons[0].key, "seizure");
  assert.match(v.reasons[0].text, /0:42–0:58/);
});

test("slow peak alpha is abnormal", () => {
  const v = computeVerdict(session({ ...healthy, features: { ...healthy.features, paf_hz: 7.5 } }));
  assert.equal(v.status, "abnormal");
  assert.equal(v.reasons[0].key, "slow_rhythm");
});

test("high theta/alpha alone is not enough; with weak reactivity it is", () => {
  assert.equal(computeVerdict(session({ ...healthy, features: { ...healthy.features, theta_alpha_ratio: 1.8 } })).status, "normal");
  const v = computeVerdict(session({ ...healthy, features: { ...healthy.features, theta_alpha_ratio: 1.8, alpha_reactivity: 1.1 } }));
  assert.equal(v.status, "abnormal");
});

test("a reliable decline from the personal baseline is abnormal", () => {
  const v = computeVerdict(session(healthy, { metrics: { paf_hz: { status: "decline" } } }));
  assert.equal(v.status, "abnormal");
  assert.equal(v.reasons[0].key, "rhythm_decline");
});
