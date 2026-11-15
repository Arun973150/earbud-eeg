const test = require("node:test");
const assert = require("node:assert/strict");
const { icc21, computeValidation, localReliability } = require("./validation");
const { scoreReaction, scoreMemory, scoreFunction, scoreHearing } = require("./scoring");
const { caide } = require("./risk");
const { guard, SAFE_FALLBACK } = require("./chat");

test("ICC(2,1) matches a hand-computed value", () => {
  // Constant +1 offset between sessions: absolute agreement penalises it (8 / 9).
  assert.equal(Math.round(icc21([[1, 2], [3, 4], [5, 6]]) * 1000) / 1000, 0.889);
  assert.equal(icc21([[1, 1], [2, 2], [3, 3]]), 1);
  assert.equal(icc21([[1, 2]]), null);
});

test("local reliability replaces the default only with enough retest pairs", () => {
  const day = (d) => new Date(Date.UTC(2026, 0, 1 + d)).toISOString();
  const sessions = [];
  for (let i = 0; i < 25; i++) {
    for (const [k, d] of [[0, 0], [1, 7], [2, 14]]) {
      sessions.push({ participantId: `p${i}`, status: "completed", completedAt: day(d), context: {}, metrics: { rt_median_ms: 250 + i * 10 + k } });
    }
  }
  const params = localReliability(sessions);
  assert.equal(params.rt_median_ms.source, "local");
  assert.equal(params.rt_median_ms.pairs, 50);
  assert.ok(params.rt_median_ms.r > 0.9);
  assert.equal(params.memory_span.source, "default");
});

test("validation segments report counts and flag small groups", () => {
  const participants = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i}`, simulated: true, birthYear: 1950, educationYears: 10,
    primaryLanguage: i < 10 ? "Arabic" : "English", truth: { decline: false },
  }));
  const v = computeValidation({ participants, sessions: [] });
  const lang = Object.fromEntries(v.segments.language.map((s) => [s.segment, s]));
  assert.equal(lang.Arabic.participants, 10);
  assert.equal(lang.Arabic.insufficient, false);
  assert.equal(lang.Other.participants, 2);
  assert.equal(lang.Other.insufficient, true);
  assert.equal(v.overall.detection.tn, 12);
  assert.equal(v.overall.detection.specificity, 1);
});

test("reaction time ignores anticipations and misses", () => {
  const trials = [100, 120, ...Array(10).fill(300), 2000].map((rt) => ({ rt }));
  assert.equal(scoreReaction({ trials }).rt_median_ms, 300);
  assert.deepEqual(scoreReaction({ trials: [{ rt: 300 }] }), {});
});

test("task scoring: memory span, daily function and hearing", () => {
  assert.equal(scoreMemory({ trials: [{ length: 3, correct: true }, { length: 4, correct: false }, { length: 4, correct: true }, { length: 5, correct: false }, { length: 5, correct: false }] }).memory_span, 4);
  assert.equal(scoreFunction({ items: { phone: 2, money: 1, meals: null } }).function_score, 3);
  const hearing = scoreHearing({ trials: [
    ...Array(6).fill({ ear: "left", heard: true, correctEar: true }),
    { ear: "right", heard: false }, { ear: "right", heard: false },
  ] });
  assert.equal(hearing.hearing_misses, 2);
  assert.equal(hearing.hearing.misses_right, 2);
});

test("CAIDE points follow Kivipelto 2006", () => {
  const year = new Date().getFullYear();
  const p = { birthYear: year - 55, sex: "male", educationYears: 8, risk: { systolicBP: 150, heightCm: 170, weightKg: 95, totalCholesterol: 7, activityMinutes: 30 } };
  // age >53: 4, education 7-9: 2, male: 1, SBP >140: 2, BMI 32.9 >30: 2, cholesterol >6.5: 2, inactive: 1
  assert.deepEqual(caide(p), { eligible: true, points: 14, max: 15, range: "12-15", risk20y: 16.4 });
  assert.equal(caide({ ...p, birthYear: year - 70 }).eligible, false);
});

test("chat guard blocks diagnosis-like replies but allows disclaimers", () => {
  assert.equal(guard("Based on this, you may have early dementia."), SAFE_FALLBACK);
  assert.equal(guard("Your doctor can diagnose this."), SAFE_FALLBACK);
  const ok = "This is not a diagnosis. Your reaction time was within your usual range.";
  assert.equal(guard(ok), ok);
});
