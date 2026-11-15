const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");

const store = require("./brainhealth/store");
const jobs = require("./jobs");
const chat = require("./brainhealth/chat");
const { scoreSession } = require("./brainhealth/scoring");
const { evaluateSession, isChangeFlag } = require("./brainhealth/evaluate");
const { computeVerdict } = require("./brainhealth/verdict");
const { riskSummary, ageOf } = require("./brainhealth/risk");
const { computeValidation, localReliability } = require("./brainhealth/validation");
const { METRICS } = require("./brainhealth/metrics");

const router = express.Router();
const EEG_DIR = path.join(__dirname, "EEG_Data_new");
const UPLOAD_DIR = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DAY = 24 * 60 * 60 * 1000;
const CONSENT_VERSION = 1;
const CONSENT_KEYS = ["eeg", "tasks", "questionnaires", "riskFactors", "genomic", "shareWithClinician", "shareWithFamily"];
const FUNCTION_ITEMS = ["phone", "shopping", "meals", "housework", "transport", "medicines", "money", "appointments"];
const SERVICES = ["primary_care", "neurology", "geriatrics", "mental_health", "audiology", "sleep_clinic"];
const ABANDON_REASONS = ["too_long", "hard_to_understand", "technical", "unwell", "other"];
const FUNCTION_INTERVAL_DAYS = 28;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `upload-${Date.now()}.edf`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.edf$/i.test(file.originalname)),
});

// ------------------------------------------------------------------ helpers

const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });
const nowIso = () => new Date().toISOString();
const addDays = (iso, days) => new Date(Date.parse(iso) + days * DAY).toISOString();

const int = (v, min, max) => {
  const n = Number(v);
  return v !== "" && v !== null && Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const num = (v, min, max) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const oneOf = (v, options) => (options.includes(v) ? v : null);
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v) => v === true;
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const yn = (v) => oneOf(v, ["yes", "no"]);

const isClinician = (req) => Boolean(req.session?.clinician);
function requireClinician(req) {
  if (!isClinician(req)) throw fail(401, "Clinician sign-in required");
}
function getParticipant(id) {
  const p = store.participant(id);
  if (!p) throw fail(404, "Participant not found");
  return p;
}
function getSession(id) {
  const s = store.session(id);
  if (!s) throw fail(404, "Check not found");
  return s;
}
const consentValid = (p) => Boolean(p.consent && !p.consent.withdrawnAt && p.consent.version === CONSENT_VERSION);
const completedOf = (participantId) => store.sessionsOf(participantId).filter((s) => s.status === "completed");

function brief(p) {
  return {
    id: p.id, code: p.code, nickname: p.nickname || "", age: ageOf(p), sex: p.sex, birthYear: p.birthYear,
    educationYears: p.educationYears, primaryLanguage: p.primaryLanguage, digitalFamiliarity: p.digitalFamiliarity,
    accommodations: p.accommodations || {}, simulated: Boolean(p.simulated),
  };
}

function pendingReview(s) {
  return Boolean(s.evaluation?.requiresReview && s.review?.status !== "completed");
}

// Participants see their result straight away; flagged checks are also queued for staff review.
function visibleOutcome(s) {
  if (s.status !== "completed") return s.status;
  return s.evaluation?.outcome;
}

const verdictOf = (s) => (s.status === "completed" ? s.verdict || computeVerdict(s) : null);

function nextCheck(sessions) {
  const done = sessions.filter((s) => s.status === "completed");
  const last = done[done.length - 1];
  if (!last) return { dueAt: nowIso(), kind: "first" };
  const ev = last.evaluation;
  if (ev.requiresReview) {
    if (last.review?.status !== "completed") return { dueAt: addDays(last.completedAt, 14), kind: "repeat" };
    if (last.review.decision === "repeat") return { dueAt: addDays(last.completedAt, (last.review.repeatWeeks || 2) * 7), kind: "repeat" };
    return { dueAt: addDays(last.completedAt, 90), kind: "routine" };
  }
  return { dueAt: addDays(last.completedAt, ev.nextCheckDays), kind: ev.outcome };
}

function functionDue(sessions) {
  const last = [...sessions].reverse().find((s) => s.status === "completed" && typeof s.metrics?.function_score === "number");
  return !last || Date.now() - Date.parse(last.completedAt) > FUNCTION_INTERVAL_DAYS * DAY;
}

function eegView(eeg, hideScreen) {
  if (!eeg) return null;
  const result = eeg.result
    ? { ...eeg.result, seizure_screen: eeg.result.seizure_screen && hideScreen ? { pending: true } : eeg.result.seizure_screen }
    : null;
  return { mode: eeg.mode, status: eeg.status, error: eeg.error || null, result };
}

function sessionView(s, req) {
  const p = getParticipant(s.participantId);
  const clinician = isClinician(req);
  const hide = false;
  return {
    session: {
      id: s.id, participantId: s.participantId, status: s.status, simulated: Boolean(s.simulated), kind: s.kind || "full",
      startedAt: s.startedAt, completedAt: s.completedAt || null, context: s.context || null,
      skipped: s.skipped || [], metrics: s.metrics || null, eeg: eegView(s.eeg, hide),
      taskEeg: s.taskEeg?.result ? { mode: s.taskEeg.mode, result: s.taskEeg.result } : null,
      evaluation: s.evaluation,
      verdict: verdictOf(s),
      review: s.review || null,
    },
    participant: brief(p),
    risk: riskSummary(p, s.metrics || {}),
    released: true,
    chat: chat.enabled(),
    clinician,
  };
}

function datasetParams(simulated) {
  return localReliability(store.load().sessions.filter((s) => Boolean(s.simulated) === simulated));
}

function cleanProfile(body = {}) {
  const year = new Date().getFullYear();
  const acc = body.accommodations || {};
  return {
    nickname: text(body.nickname, 40),
    birthYear: int(body.birthYear, 1920, year - 18),
    sex: oneOf(body.sex, ["female", "male"]),
    educationYears: int(body.educationYears, 0, 30),
    primaryLanguage: text(body.primaryLanguage, 40) || null,
    digitalFamiliarity: oneOf(body.digitalFamiliarity, ["low", "medium", "high"]),
    accommodations: {
      hearing: bool(acc.hearing), vision: bool(acc.vision), motor: bool(acc.motor),
      readAloud: bool(acc.readAloud), assisted: bool(acc.assisted),
    },
  };
}

function cleanRisk(body = {}, consent = {}) {
  const fh = body.familyHistory || {};
  return {
    heightCm: num(body.heightCm, 100, 230), weightKg: num(body.weightKg, 25, 300),
    systolicBP: num(body.systolicBP, 70, 260), hypertension: yn(body.hypertension),
    activityMinutes: num(body.activityMinutes, 0, 3000),
    diabetes: yn(body.diabetes), totalCholesterol: num(body.totalCholesterol, 1, 20), ldl: num(body.ldl, 0.5, 15),
    sleepHours: num(body.sleepHours, 0, 16), sleepQuality: int(body.sleepQuality, 1, 5), snoring: yn(body.snoring),
    depression: yn(body.depression), isolated: yn(body.isolated),
    smoking: oneOf(body.smoking, ["never", "former", "current"]),
    alcoholUnits: num(body.alcoholUnits, 0, 200), airPollution: yn(body.airPollution),
    headInjury: yn(body.headInjury), hearingDifficulty: yn(body.hearingDifficulty), visionDifficulty: yn(body.visionDifficulty),
    familyHistory: { dementia: yn(fh.dementia), epilepsy: yn(fh.epilepsy), stroke: yn(fh.stroke), parkinsons: yn(fh.parkinsons) },
    apoe: consent.genomic ? oneOf(body.apoe, ["unknown", "none", "one", "two"]) : null,
    updatedAt: nowIso(),
  };
}

function cleanContext(c) {
  c = c || {};
  return {
    sleepHours: num(c.sleepHours, 0, 16), sleepQuality: int(c.sleepQuality, 1, 5),
    fasting: bool(c.fasting), unwell: bool(c.unwell), caffeine: bool(c.caffeine),
    assisted: bool(c.assisted), volumeNote: text(c.volumeNote, 60),
  };
}

function cleanRaw(raw) {
  raw = raw || {};
  const fn = raw.function;
  return {
    reaction: { trials: list(raw.reaction?.trials, 60).map((t) => ({ rt: num(t?.rt, 0, 5000), anticipation: bool(t?.anticipation), miss: bool(t?.miss) })) },
    pattern: {
      durationSec: num(raw.pattern?.durationSec, 1, 600),
      trials: list(raw.pattern?.trials, 400).map((t) => ({ correct: bool(t?.correct), rt: num(t?.rt, 0, 20000) })),
    },
    memory: { trials: list(raw.memory?.trials, 40).map((t) => ({ length: int(t?.length, 1, 12), correct: bool(t?.correct) })) },
    hearing: {
      trials: list(raw.hearing?.trials, 40).map((t) => ({
        ear: oneOf(t?.ear, ["left", "right"]), freq: num(t?.freq, 100, 12000), level: num(t?.level, 0, 1),
        heard: bool(t?.heard), correctEar: bool(t?.correctEar), rt: num(t?.rt, 0, 10000),
      })),
      falseAlarms: int(raw.hearing?.falseAlarms, 0, 200),
    },
    mood: { phq2: list(raw.mood?.phq2, 2).map((x) => int(x, 0, 3)), gad2: list(raw.mood?.gad2, 2).map((x) => int(x, 0, 3)) },
    function: fn ? {
      informant: oneOf(fn.informant, ["self", "family", "carer"]) || "self",
      items: Object.fromEntries(FUNCTION_ITEMS.map((k) => [k, [0, 1, 2].includes(fn.items?.[k]) ? fn.items[k] : null])),
    } : null,
  };
}

// ------------------------------------------------------------------ status

router.get("/status", (req, res) => {
  res.json({ chat: chat.enabled(), clinician: isClinician(req), consentVersion: CONSENT_VERSION });
});

// ------------------------------------------------------------------ participants

router.get("/participants", (req, res) => {
  const clinician = isClinician(req);
  const db = store.load();
  const items = db.participants.map((p) => {
    const sessions = store.sessionsOf(p.id);
    const done = sessions.filter((s) => s.status === "completed");
    const last = done[done.length - 1];
    return {
      ...brief(p),
      createdAt: p.createdAt,
      checks: done.length,
      lastCheckAt: last?.completedAt || null,
      lastOutcome: last ? visibleOutcome(last) : null,
      lastVerdict: last ? verdictOf(last)?.status || null : null,
      nextCheck: nextCheck(sessions),
    };
  });
  items.sort((a, b) => (a.simulated - b.simulated) || (b.createdAt || "").localeCompare(a.createdAt || "") || a.code.localeCompare(b.code));
  res.json({ participants: items });
});

router.post("/participants", (req, res) => {
  const profile = cleanProfile(req.body);
  if (!profile.birthYear) throw fail(400, "Please enter a valid birth year (adults only).");
  const db = store.load();
  let code;
  do code = `P-${crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4)}`;
  while (db.participants.some((p) => p.code === code));
  const p = { id: store.newId("p"), code, simulated: false, createdAt: nowIso(), consent: null, risk: {}, ...profile };
  db.participants.push(p);
  store.logEvent("participant_created", { participantId: p.id });
  store.save();
  res.status(201).json({ participant: brief(p) });
});

router.get("/participants/:id", (req, res) => {
  const p = getParticipant(req.params.id);
  const clinician = isClinician(req);
  const sessions = store.sessionsOf(p.id);
  const done = sessions.filter((s) => s.status === "completed");
  const last = done[done.length - 1];
  res.json({
    participant: { ...brief(p), consent: p.consent || null, risk: p.risk || {} },
    consentValid: consentValid(p),
    risk: riskSummary(p, last?.metrics || {}),
    sessions: sessions.map((s) => ({
      id: s.id, status: s.status, startedAt: s.startedAt, completedAt: s.completedAt || null,
      outcome: visibleOutcome(s), verdict: verdictOf(s)?.status || null, reviewStatus: s.review?.status || null, simulated: Boolean(s.simulated),
    })),
    latest: last ? {
      sessionId: last.id, completedAt: last.completedAt,
      evaluation: last.evaluation,
      verdict: verdictOf(last),
      eeg: last.eeg?.result ? { quality: last.eeg.result.quality, features: last.eeg.result.features, seizure_screen: last.eeg.result.seizure_screen, source: last.eeg.result.source } : null,
      review: last.review || null,
    } : null,
    nextCheck: nextCheck(sessions),
    functionDue: functionDue(sessions),
  });
});

router.put("/participants/:id", (req, res) => {
  const p = getParticipant(req.params.id);
  const profile = cleanProfile({ ...brief(p), ...req.body });
  if (!profile.birthYear) throw fail(400, "Please enter a valid birth year (adults only).");
  Object.assign(p, profile);
  store.logEvent("profile_updated", { participantId: p.id });
  store.save();
  res.json({ participant: brief(p) });
});

router.put("/participants/:id/consent", (req, res) => {
  const p = getParticipant(req.params.id);
  if (req.body?.withdraw === true) {
    p.consent = { ...(p.consent || {}), withdrawnAt: nowIso() };
    store.logEvent("consent_withdrawn", { participantId: p.id });
  } else {
    const categories = Object.fromEntries(CONSENT_KEYS.map((k) => [k, bool(req.body?.categories?.[k])]));
    if (!categories.tasks) throw fail(400, "Consent to the brain-check tasks is needed to take a check.");
    p.consent = { version: CONSENT_VERSION, givenAt: nowIso(), categories };
    if (!categories.genomic && p.risk) p.risk.apoe = null;
    store.logEvent("consent_given", { participantId: p.id, categories });
  }
  store.save();
  res.json({ consent: p.consent, consentValid: consentValid(p) });
});

router.put("/participants/:id/risk", (req, res) => {
  const p = getParticipant(req.params.id);
  if (!consentValid(p) || !p.consent.categories.riskFactors) throw fail(403, "Consent to store health and risk information is needed first.");
  p.risk = cleanRisk(req.body, p.consent.categories);
  store.logEvent("risk_updated", { participantId: p.id });
  store.save();
  res.json({ risk: p.risk, summary: riskSummary(p, completedOf(p.id).at(-1)?.metrics || {}) });
});

router.get("/participants/:id/trends", (req, res) => {
  const p = getParticipant(req.params.id);
  const clinician = isClinician(req);
  const done = completedOf(p.id);
  const metrics = {};
  for (const id of Object.keys(METRICS)) {
    const points = done.filter((s) => typeof s.metrics?.[id] === "number").map((s) => {
      const ev = s.evaluation?.metrics?.[id];
      const hidden = false;
      return {
        sessionId: s.id, at: s.completedAt, value: s.metrics[id],
        status: hidden ? "pending" : ev?.status || null,
        confounded: (s.evaluation?.confounders || []).length > 0,
      };
    });
    if (!points.length) continue;
    const withBand = [...done].reverse().find((s) => typeof s.evaluation?.metrics?.[id]?.low === "number");
    const band = withBand ? withBand.evaluation.metrics[id] : null;
    metrics[id] = { points, band: band ? { baseline: band.baseline, low: band.low, high: band.high } : null };
  }
  res.json({ participant: brief(p), metrics });
});

// ------------------------------------------------------------------ checks

router.post("/participants/:id/sessions", (req, res) => {
  const p = getParticipant(req.params.id);
  if (!consentValid(p)) throw fail(403, "Please review and give consent before starting a check.");
  const s = {
    id: store.newId("s"), participantId: p.id, simulated: false, status: "in_progress", startedAt: nowIso(),
    kind: req.body?.kind === "full" ? "full" : "eeg",
    context: null, raw: null, eeg: null, metrics: null, evaluation: null, review: null,
  };
  store.load().sessions.push(s);
  store.logEvent("session_started", { participantId: p.id, sessionId: s.id });
  store.save();
  res.status(201).json({
    sessionId: s.id,
    functionDue: functionDue(store.sessionsOf(p.id)),
    consent: p.consent.categories,
  });
});

router.post("/sessions/:id/eeg", (req, res) => {
  const s = getSession(req.params.id);
  const p = getParticipant(s.participantId);
  if (s.status !== "in_progress") throw fail(409, "This check is already finished.");
  if (!p.consent?.categories?.eeg) throw fail(403, "No consent for EEG recording.");
  const simulated = req.body?.mode === "simulated";
  const closed = [30, 60].includes(req.body?.closed) ? req.body.closed : 60;
  const open = [30, 60].includes(req.body?.open) ? req.body.open : 60;
  const args = ["--record", "--closed", String(closed), "--open", String(open), "--session", s.id, "--out", EEG_DIR, "--screen-seizures"];
  if (simulated) args.push("--simulate", "--seed", `${p.id}|${s.id}`);
  const job = jobs.startJob({
    type: "eeg", script: "brain_check.py", args, usesSerial: !simulated, timeoutMs: (closed + open + 180) * 1000,
    onDone: (j) => {
      s.eeg = { jobId: j.id, mode: simulated ? "simulated" : "earbud", status: j.status, result: j.result, error: j.error, at: nowIso() };
      store.logEvent("eeg_recorded", { sessionId: s.id, status: j.status, code: j.error?.code });
      store.save();
    },
  });
  s.eeg = { jobId: job.id, mode: simulated ? "simulated" : "earbud", status: "running", at: nowIso() };
  store.save();
  res.status(202).json({ job });
});

const TASK_LABELS = ["rest", "reaction", "pattern", "memory"];

router.post("/sessions/:id/task-eeg", (req, res) => {
  const s = getSession(req.params.id);
  const p = getParticipant(s.participantId);
  if (s.status === "abandoned") throw fail(409, "This check was stopped.");
  if (!p.consent?.categories?.eeg) throw fail(403, "No consent for EEG recording.");
  const simulated = req.body?.mode === "simulated";
  const args = ["--task", "--max", "900", "--rest", "20"];
  if (simulated) args.push("--simulate", "--seed", `${p.id}-task`);
  const job = jobs.startJob({
    type: "task", script: "brain_check.py", args, usesSerial: !simulated, timeoutMs: 20 * 60 * 1000,
    onDone: (j) => {
      s.taskEeg = { jobId: j.id, mode: simulated ? "simulated" : "earbud", status: j.status, result: j.result, error: j.error, at: nowIso() };
      store.logEvent("task_eeg_recorded", { sessionId: s.id, status: j.status });
      store.save();
    },
  });
  s.taskEeg = { jobId: job.id, mode: simulated ? "simulated" : "earbud", status: "running", at: nowIso() };
  store.save();
  res.status(202).json({ job });
});

router.post("/jobs/:id/marker", (req, res) => {
  const label = oneOf(req.body?.label, TASK_LABELS);
  const phase = oneOf(req.body?.phase, ["start", "end"]);
  if (!label || !phase) throw fail(400, "Unknown marker");
  const job = jobs.addMarker(req.params.id, label, phase);
  if (!job) throw fail(404, "No running recording");
  res.json({ ok: true });
});

router.post("/jobs/:id/finish", (req, res) => {
  const job = jobs.finishTask(req.params.id);
  if (!job) throw fail(404, "Job not found");
  res.json({ job });
});

router.post("/eeg/contact", (req, res) => {
  const simulated = req.body?.simulate === true;
  const args = ["--contact", "--max", "60"];
  if (simulated) args.push("--simulate", "--seed", "contact");
  const job = jobs.startJob({ type: "contact", script: "brain_check.py", args, usesSerial: !simulated, timeoutMs: 90 * 1000 });
  res.status(202).json({ job });
});

router.get("/eeg/ports", async (req, res) => {
  const job = await jobs.runOnce("brain_check.py", ["--list-ports"]);
  if (job.status !== "done") throw fail(500, job.error?.message || "Could not list serial ports");
  res.json(job.result);
});

router.get("/jobs/:id", (req, res) => {
  const job = jobs.getJob(req.params.id);
  if (!job) throw fail(404, "Job not found");
  res.json({ job });
});

router.delete("/jobs/:id", (req, res) => {
  const job = jobs.stopJob(req.params.id);
  if (!job) throw fail(404, "Job not found");
  res.json({ job });
});

router.post("/sessions/:id/complete", (req, res) => {
  const s = getSession(req.params.id);
  if (s.status !== "in_progress") throw fail(409, "This check is already finished.");
  if (s.eeg?.status === "running") throw fail(409, "The EEG recording is still running.");
  const p = getParticipant(s.participantId);
  const history = completedOf(p.id);

  s.context = cleanContext(req.body?.context);
  s.raw = cleanRaw(req.body?.raw);
  s.skipped = list(req.body?.skipped, 10).map((x) => text(x, 20)).filter(Boolean);
  s.metrics = scoreSession(s.raw, s.eeg?.status === "done" ? s.eeg : null);
  s.status = "completed";
  s.completedAt = nowIso();
  s.evaluation = evaluateSession({ participant: p, session: s, history, params: datasetParams(false) });
  s.verdict = computeVerdict(s);
  const flagged = s.evaluation.requiresReview || s.verdict.status === "abnormal";
  s.review = flagged ? { status: "pending", flaggedAt: s.completedAt } : { status: "not_required" };

  store.logEvent("session_completed", { participantId: p.id, sessionId: s.id, outcome: s.evaluation.outcome });
  if (flagged) store.logEvent("review_requested", { sessionId: s.id, outcome: s.evaluation.outcome });
  store.save();
  res.json(sessionView(s, req));
});

// "Add memory & focus": games and mood added to a finished EEG check, then re-evaluated.
router.post("/sessions/:id/focus", (req, res) => {
  const s = getSession(req.params.id);
  if (s.status !== "completed") throw fail(409, "Finish the EEG check first.");
  if (s.taskEeg?.status === "running") throw fail(409, "The focus recording is still being analysed.");
  const p = getParticipant(s.participantId);
  const history = completedOf(p.id).filter((x) => x.id !== s.id && x.completedAt < s.completedAt);
  s.raw = { ...(s.raw || {}), ...cleanRaw(req.body?.raw) };
  s.metrics = scoreSession(s.raw, s.eeg?.status === "done" ? s.eeg : null);
  s.kind = "full";
  s.focusAt = nowIso();
  s.evaluation = evaluateSession({ participant: p, session: s, history, params: datasetParams(false) });
  s.verdict = computeVerdict(s);
  if ((s.evaluation.requiresReview || s.verdict.status === "abnormal") && s.review?.status !== "completed") {
    s.review = { status: "pending", flaggedAt: s.review?.flaggedAt || nowIso() };
  }
  store.logEvent("focus_added", { sessionId: s.id });
  store.save();
  res.json(sessionView(s, req));
});

router.post("/sessions/:id/abandon", (req, res) => {
  const s = getSession(req.params.id);
  if (s.status !== "in_progress") throw fail(409, "This check is already finished.");
  if (s.eeg?.status === "running" && s.eeg.jobId) jobs.stopJob(s.eeg.jobId);
  if (s.taskEeg?.status === "running" && s.taskEeg.jobId) jobs.stopJob(s.taskEeg.jobId);
  s.status = "abandoned";
  s.abandonedAt = nowIso();
  s.abandon = { reason: oneOf(req.body?.reason, ABANDON_REASONS) || "other", step: text(req.body?.step, 20) };
  store.logEvent("session_abandoned", { sessionId: s.id, ...s.abandon });
  store.save();
  res.json({ ok: true });
});

router.get("/sessions/:id", (req, res) => {
  res.json(sessionView(getSession(req.params.id), req));
});

router.post("/sessions/:id/chat", async (req, res) => {
  if (!chat.enabled()) throw fail(503, "The AI explainer is not configured on this server.");
  const s = getSession(req.params.id);
  if (s.status !== "completed") throw fail(409, "The check isn't finished yet.");
  const reply = await chat.answer({ evaluation: s.evaluation, review: s.review, message: req.body?.message, history: req.body?.history });
  store.logEvent("chat", { sessionId: s.id, question: text(req.body?.message, 500), answer: reply });
  res.json({ reply });
});

// ------------------------------------------------------------------ clinician

router.post("/clinician/login", (req, res) => {
  const pin = Buffer.from(String(req.body?.pin || ""));
  const expected = Buffer.from(process.env.CLINICIAN_PIN || "1234");
  if (pin.length !== expected.length || !crypto.timingSafeEqual(pin, expected)) throw fail(401, "Incorrect PIN");
  req.session.clinician = true;
  store.logEvent("clinician_signed_in");
  res.json({ clinician: true });
});

router.post("/clinician/logout", (req, res) => {
  req.session.clinician = false;
  res.json({ clinician: false });
});

function queueItem(s) {
  const p = store.participant(s.participantId);
  return {
    sessionId: s.id, participant: brief(p), completedAt: s.completedAt,
    waitingDays: Math.round(((Date.now() - Date.parse(s.review?.flaggedAt || s.completedAt)) / DAY) * 10) / 10,
    outcome: s.evaluation.outcome, reasons: s.evaluation.reasons, services: s.evaluation.services,
    review: s.review,
  };
}

// A fixed ~20% of real participants who were never flagged, so specificity can be
// measured against a reference assessment rather than assumed.
function verificationSample(db) {
  return db.participants
    .filter((p) => !p.simulated)
    .filter((p) => crypto.createHash("sha1").update(p.id).digest()[0] < 52)
    .map((p) => ({ p, done: completedOf(p.id) }))
    .filter(({ done }) => done.length && !done.some((s) => isChangeFlag(s.evaluation)) && !done.some((s) => s.review?.referenceOutcome && s.review.referenceOutcome !== "not_assessed"))
    .map(({ p, done }) => ({ sessionId: done.at(-1).id, participant: brief(p), completedAt: done.at(-1).completedAt }));
}

router.get("/clinician/queue", (req, res) => {
  requireClinician(req);
  const db = store.load();
  const pending = db.sessions
    .filter((s) => s.review?.status === "pending")
    .map(queueItem)
    .sort((a, b) => (b.outcome === "urgent") - (a.outcome === "urgent") || a.completedAt.localeCompare(b.completedAt));
  const recent = db.sessions
    .filter((s) => s.review?.status === "completed")
    .sort((a, b) => b.review.decidedAt.localeCompare(a.review.decidedAt))
    .slice(0, 12)
    .map(queueItem);
  res.json({ pending, recent, verification: verificationSample(db) });
});

router.post("/sessions/:id/review", (req, res) => {
  requireClinician(req);
  const s = getSession(req.params.id);
  if (s.status !== "completed") throw fail(409, "Only finished checks can be reviewed.");
  const decision = oneOf(req.body?.decision, ["refer", "repeat", "no_action"]);
  if (!decision) throw fail(400, "Choose a decision.");
  const services = list(req.body?.services, SERVICES.length).filter((x) => SERVICES.includes(x));
  if (decision === "refer" && !services.length) throw fail(400, "Choose at least one service to refer to.");
  s.review = {
    status: "completed",
    verification: !s.evaluation?.requiresReview,
    flaggedAt: s.review?.flaggedAt || null,
    decidedAt: nowIso(),
    decision,
    services: decision === "refer" ? services : [],
    repeatWeeks: decision === "repeat" ? int(req.body?.repeatWeeks, 1, 26) || 2 : null,
    referenceOutcome: oneOf(req.body?.referenceOutcome, ["change_confirmed", "no_change", "not_assessed"]) || "not_assessed",
    notes: text(req.body?.notes, 1000),
    reviewer: text(req.body?.reviewer, 80) || "Clinician",
  };
  store.logEvent("review_completed", { sessionId: s.id, decision, services: s.review.services, reviewer: s.review.reviewer });
  store.save();
  res.json(sessionView(s, req));
});

// ------------------------------------------------------------------ validation

router.get("/validation", (req, res) => {
  const simulated = req.query.dataset !== "real";
  const db = store.load();
  res.json({
    dataset: simulated ? "simulated" : "real",
    ...computeValidation({
      participants: db.participants.filter((p) => Boolean(p.simulated) === simulated),
      sessions: db.sessions.filter((s) => Boolean(s.simulated) === simulated),
    }),
  });
});

// ------------------------------------------------------------------ EDF seizure screen

router.post("/screen", upload.single("edfFile"), (req, res) => {
  if (!req.file) throw fail(400, "Please choose an .edf file.");
  const original = text(req.file.originalname, 120);
  const job = jobs.startJob({
    type: "screen", script: "predict_seizure.py", args: [req.file.path, EEG_DIR], timeoutMs: 5 * 60 * 1000,
    onDone: (j) => {
      if (j.result) {
        j.result.file = original;
        j.result.visualizationUrl = j.result.visualization ? `/eeg_data/${path.basename(j.result.visualization)}` : null;
        delete j.result.visualization;
      }
      store.logEvent("edf_screened", { file: original, decision: j.result?.decision || null });
    },
  });
  res.status(202).json({ job });
});

router.use((req, res) => res.status(404).json({ error: "Not found" }));

module.exports = router;
