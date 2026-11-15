// Restricted AI explainer. It only sees results the server computed for this
// check, may not diagnose, and is reined in further while a review is pending.
const { OpenAI } = require("openai");

const MAX_MESSAGE = 500;
const MAX_TURNS = 6;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const SAFE_FALLBACK =
  "I can't answer that in a way that might sound like a diagnosis. These results are a risk check, " +
  "not a diagnosis. A qualified clinician is the right person to explain what they mean for you.";

const METRIC_LABELS = {
  rt_median_ms: "reaction time (ms, lower is faster)",
  rt_cv: "reaction-time variability (lower is steadier)",
  pattern_correct_per_min: "pattern comparison (correct per minute)",
  memory_span: "pattern memory span",
  paf_hz: "peak alpha frequency (Hz)",
  theta_alpha_ratio: "theta/alpha ratio",
  alpha_reactivity: "alpha reactivity (eyes closed vs open)",
  hearing_misses: "missed hearing tones",
};

let client = null;
const enabled = () => Boolean(process.env.OPENAI_API_KEY);
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function summary(evaluation, review) {
  const pending = evaluation.requiresReview && review?.status !== "completed";
  const metrics = Object.fromEntries(Object.entries(evaluation.metrics).map(([id, m]) => [
    METRIC_LABELS[id] || id,
    pending ? { value: m.value } : { value: m.value, status: m.status, usual_range: m.low !== undefined ? [m.low, m.high] : null },
  ]));
  return {
    outcome: pending ? "waiting for clinician review" : evaluation.outcome,
    next_check_days: evaluation.nextCheckDays,
    metrics,
    recommendations: evaluation.recommendations,
    clinician_review: review?.status === "completed"
      ? { decision: review.decision, services: review.services, repeat_weeks: review.repeatWeeks ?? null }
      : review?.status || "not required",
  };
}

function systemPrompt(evaluation, review) {
  const pending = evaluation.requiresReview && review?.status !== "completed";
  return [
    "You explain the results of an earbud brain-health check to the person who took it.",
    "Write plain, warm English a 12-year-old could follow, in under 120 words.",
    "Rules you must always follow:",
    "- You are not a doctor. Never diagnose. Never say or imply the person has, or does not have, any condition (for example dementia, Alzheimer's, mild cognitive impairment, epilepsy, stroke, depression or anxiety disorder).",
    "- Never change, soften or contradict the outcome, clinician decision, recommendations or next-check timing below.",
    "- No medication or dosage advice.",
    "- Use only the facts below. If something isn't covered, say you don't know and suggest asking their clinician.",
    "- If they describe an emergency (a seizure now, stroke signs such as face drooping or weakness, chest pain, or thoughts of harming themselves), tell them to contact emergency services immediately.",
    pending
      ? "- These results are waiting for a clinician. Do not interpret any individual result as good or bad; explain that a qualified clinician will review them and contact them, and what a review involves."
      : "- 'Usual range' means the person's own baseline range; a result outside it is a change for them, not a diagnosis.",
    "",
    `Results computed by the system: ${JSON.stringify(summary(evaluation, review))}`,
  ].join("\n");
}

// Belt-and-braces check on the model's reply.
function guard(reply) {
  const text = String(reply || "").trim();
  if (!text) return SAFE_FALLBACK;
  const withoutNegations = text.replace(/\bnot (?:a |an )?diagnos\w*/gi, "");
  const diagnostic =
    /\bdiagnos\w*/i.test(withoutNegations) ||
    /\byou (?:may |might |probably |likely |definitely |could )?(?:have|has|are suffering from|are showing signs of|are developing)\b[^.]{0,40}\b(dementia|alzheimer|epilep|mild cognitive impairment|\bmci\b|parkinson|stroke|depression|anxiety disorder|tumou?r)/i.test(text);
  return diagnostic ? SAFE_FALLBACK : text;
}

async function answer({ evaluation, review, message, history = [] }) {
  const question = String(message || "").trim().slice(0, MAX_MESSAGE);
  if (!question) throw Object.assign(new Error("Message is empty"), { status: 400, expose: true });
  const turns = (Array.isArray(history) ? history : [])
    .filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.content === "string")
    .slice(-MAX_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_MESSAGE) }));

  const completion = await getClient().chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_completion_tokens: 300,
    messages: [{ role: "system", content: systemPrompt(evaluation, review) }, ...turns, { role: "user", content: question }],
  });
  return guard(completion.choices[0]?.message?.content);
}

module.exports = { answer, guard, enabled, SAFE_FALLBACK };
