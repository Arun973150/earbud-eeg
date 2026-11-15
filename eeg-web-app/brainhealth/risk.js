// Risk context: the 14 modifiable dementia risk factors from the 2024 Lancet
// Commission, plus the CAIDE midlife dementia risk score (Kivipelto et al.,
// Lancet Neurology 2006; PMID 16914401).

const LANCET_FACTORS = [
  "less_education", "hearing_loss", "high_ldl", "depression", "head_injury",
  "physical_inactivity", "diabetes", "smoking", "hypertension", "obesity",
  "excess_alcohol", "social_isolation", "air_pollution", "vision_loss",
];

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const yesNo = (v) => (v === "yes" ? "present" : v === "no" ? "absent" : "unknown");
const threshold = (value, isPresent) => (isNum(value) ? (isPresent(value) ? "present" : "absent") : "unknown");

function ageOf(participant, at = new Date()) {
  return isNum(participant?.birthYear) ? at.getFullYear() - participant.birthYear : null;
}

function bmiOf(risk = {}) {
  if (isNum(risk.bmi)) return risk.bmi;
  if (isNum(risk.heightCm) && isNum(risk.weightKg) && risk.heightCm > 0) {
    return Math.round((risk.weightKg / (risk.heightCm / 100) ** 2) * 10) / 10;
  }
  return null;
}

// latest: the most recent session metrics, so a positive mood screen or missed
// tones count even before the profile is filled in.
function lancetFactors(participant, latest = {}) {
  const risk = participant?.risk || {};
  const edu = participant?.educationYears;
  const statuses = {
    less_education: threshold(edu, (y) => y < 10),
    hearing_loss: risk.hearingDifficulty === "yes" || (latest.hearing_misses ?? 0) >= 4 ? "present" : yesNo(risk.hearingDifficulty),
    high_ldl: threshold(risk.ldl, (v) => v > 3.0),
    depression: risk.depression === "yes" || (latest.phq2 ?? 0) >= 3 ? "present" : yesNo(risk.depression),
    head_injury: yesNo(risk.headInjury),
    physical_inactivity: threshold(risk.activityMinutes, (m) => m < 150),
    diabetes: yesNo(risk.diabetes),
    smoking: risk.smoking === "current" ? "present" : risk.smoking ? "absent" : "unknown",
    hypertension: risk.hypertension === "yes" ? "present" : threshold(risk.systolicBP, (s) => s > 130),
    obesity: threshold(bmiOf(risk), (b) => b >= 30),
    excess_alcohol: threshold(risk.alcoholUnits, (u) => u > 21),
    social_isolation: yesNo(risk.isolated),
    air_pollution: yesNo(risk.airPollution),
    vision_loss: yesNo(risk.visionDifficulty),
  };
  return LANCET_FACTORS.map((id) => ({ id, status: statuses[id] }));
}

// CAIDE model 1 points. Valid for midlife (derived in people aged 39-64).
function caide(participant, at = new Date()) {
  const risk = participant?.risk || {};
  const age = ageOf(participant, at);
  const edu = participant?.educationYears;
  const bmi = bmiOf(risk);
  const missing = [];
  if (!isNum(age)) missing.push("age");
  if (!isNum(edu)) missing.push("education");
  if (participant?.sex !== "male" && participant?.sex !== "female") missing.push("sex");
  if (!isNum(risk.systolicBP)) missing.push("systolicBP");
  if (!isNum(bmi)) missing.push("bmi");
  if (!isNum(risk.totalCholesterol)) missing.push("totalCholesterol");
  if (!isNum(risk.activityMinutes)) missing.push("activity");

  if (isNum(age) && (age < 39 || age > 64)) return { eligible: false, reason: "age", age };
  if (missing.length) return { eligible: false, reason: "missing", missing };

  const points =
    (age < 47 ? 0 : age <= 53 ? 3 : 4) +
    (edu >= 10 ? 0 : edu >= 7 ? 2 : 3) +
    (participant.sex === "male" ? 1 : 0) +
    (risk.systolicBP > 140 ? 2 : 0) +
    (bmi > 30 ? 2 : 0) +
    (risk.totalCholesterol > 6.5 ? 2 : 0) +
    (risk.activityMinutes < 150 ? 1 : 0);

  const band =
    points <= 5 ? { range: "0-5", risk20y: 1.0 } :
    points <= 7 ? { range: "6-7", risk20y: 1.9 } :
    points <= 9 ? { range: "8-9", risk20y: 4.2 } :
    points <= 11 ? { range: "10-11", risk20y: 7.4 } : { range: "12-15", risk20y: 16.4 };

  return { eligible: true, points, max: 15, ...band };
}

function riskSummary(participant, latest = {}) {
  const factors = lancetFactors(participant, latest);
  const consent = participant?.consent?.categories || {};
  const risk = participant?.risk || {};
  return {
    age: ageOf(participant),
    factors,
    modifiablePresent: factors.filter((f) => f.status === "present").length,
    unknown: factors.filter((f) => f.status === "unknown").length,
    caide: caide(participant),
    familyHistory: risk.familyHistory || {},
    apoe: consent.genomic ? risk.apoe || "unknown" : null,
    sleep: { hours: risk.sleepHours ?? null, quality: risk.sleepQuality ?? null, snoring: risk.snoring ?? null },
  };
}

module.exports = { LANCET_FACTORS, lancetFactors, caide, riskSummary, ageOf, bmiOf };
