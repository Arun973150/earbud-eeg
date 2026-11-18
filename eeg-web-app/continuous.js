// Background screening (continuous EEG while the earbud is worn), daily habits,
// explainable alerts and the clinical escalation pathway.
const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const multer = require("multer");

const store = require("./brainhealth/store");
const jobs = require("./jobs");
const secure = require("./brainhealth/secure");
const { evaluateDaily, MARKERS } = require("./brainhealth/daily");
const { TIERS, syncAlerts, act, overdue, ACTIONS } = require("./brainhealth/escalation");
const { ageOf } = require("./brainhealth/risk");

const router = express.Router();
const EEG_DIR = path.join(__dirname, "EEG_Data_new");
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /\.(csv|txt)$/i.test(file.originalname)),
});

const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });
const nowIso = () => new Date().toISOString();
const num = (v, min, max) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const isClinician = (req) => Boolean(req.session?.clinician);
function participantOr404(id) {
  const p = store.participant(id);
  if (!p) throw fail(404, "Participant not found");
  return p;
}
const consentValid = (p) => Boolean(p.consent && !p.consent.withdrawnAt);
const brief = (p) => ({ id: p.id, code: p.code, nickname: p.nickname || "", age: ageOf(p), simulated: Boolean(p.simulated) });

// Re-run the daily engine and turn its findings into stored alerts.
function refreshDaily(p, now = new Date()) {
  const db = store.load();
  const ev = evaluateDaily({ monitoring: store.monitoringOf(p.id), habits: store.habitsOf(p.id), now });
  const created = syncAlerts(db, p.id, ev.alerts, now, store.newId);
  for (const a of created) store.logEvent("alert_created", { participantId: p.id, alertId: a.id, tier: a.tier, marker: a.marker });
  store.save();
  return ev;
}

// ------------------------------------------------------------------ background sessions

router.post("/participants/:id/monitor", (req, res) => {
  const p = participantOr404(req.params.id);
  if (!consentValid(p) || !p.consent.categories?.eeg) throw fail(403, "EEG recording isn't included in this person's consent.");
  const simulated = req.body?.mode === "simulated";
  const minutes = num(req.body?.maxMinutes, 1, 240) || 60;
  const id = store.newId("m");
  const args = ["--monitor", "--max", String(minutes * 60), "--session", id, "--out", EEG_DIR, "--live-screen"];
  if (simulated) args.push("--simulate", "--seed", `${p.id}|${id}`);
  const job = jobs.startJob({
    type: "monitor", script: "brain_check.py", args, usesSerial: !simulated, timeoutMs: (minutes * 60 + 600) * 1000,
    onDone: (j) => {
      const r = j.result;
      if (!r) {
        store.logEvent("monitor_failed", { participantId: p.id, code: j.error?.code });
        return;
      }
      if (r.edf_file) secure.encryptFile(path.join(EEG_DIR, r.edf_file));
      store.load().monitoring.push({
        id, participantId: p.id, simulated: simulated || Boolean(p.simulated), source: r.source,
        startedAt: new Date(Date.now() - (r.duration_s || 0) * 1000).toISOString(), endedAt: nowIso(),
        minutes: r.minutes, cleanMinutes: r.clean_minutes, markers: r.markers, timeline: r.timeline,
        seizure: r.seizure_screen ? {
          decision: r.seizure_screen.decision, events: r.seizure_screen.events || [], isolated_spikes: r.seizure_screen.isolated_spikes || 0,
          window_probabilities: r.seizure_screen.window_probabilities || [], window_step_s: r.seizure_screen.window_step_s || 2,
          probability_max: r.seizure_screen.probability_max,
        } : null,
        edf_file: r.edf_file || null,
      });
      store.logEvent("monitor_recorded", { participantId: p.id, monitoringId: id, minutes: r.minutes, clean: r.clean_minutes });
      refreshDaily(p);
    },
  });
  res.status(202).json({ job, monitoringId: id });
});

router.get("/participants/:id/monitoring", (req, res) => {
  const p = participantOr404(req.params.id);
  res.json({ monitoring: store.monitoringOf(p.id).map(({ timeline, ...m }) => m) });
});

router.get("/monitoring/:id", (req, res) => {
  const m = store.load().monitoring.find((x) => x.id === req.params.id);
  if (!m) throw fail(404, "Session not found");
  res.json({ monitoring: m, participant: brief(store.participant(m.participantId)) });
});

// ------------------------------------------------------------------ daily habits

function cleanHabit(body = {}) {
  return {
    sleepHours: num(body.sleepHours, 0, 16),
    sleepQuality: num(body.sleepQuality, 1, 5),
    activeMinutes: num(body.activeMinutes, 0, 600),
    stress: num(body.stress, 1, 5),
  };
}

function upsertHabit(p, date, values, source) {
  const db = store.load();
  const existing = db.habits.find((h) => h.participantId === p.id && h.date === date);
  if (existing) Object.assign(existing, Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null)), { source, updatedAt: nowIso() });
  else db.habits.push({ participantId: p.id, date, ...values, source, createdAt: nowIso() });
}

const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z")) && d <= new Date().toISOString().slice(0, 10);

function needHabitConsent(p) {
  if (!consentValid(p) || !p.consent.categories?.riskFactors) throw fail(403, "Sharing health and lifestyle information isn't included in this person's consent.");
}

router.put("/participants/:id/habits/:date", (req, res) => {
  const p = participantOr404(req.params.id);
  needHabitConsent(p);
  if (!validDate(req.params.date)) throw fail(400, "Use a date like 2026-11-18 (not in the future).");
  const values = cleanHabit(req.body);
  if (Object.values(values).every((v) => v === null)) throw fail(400, "Add at least one answer.");
  upsertHabit(p, req.params.date, values, "checkin");
  store.logEvent("habits_checkin", { participantId: p.id, date: req.params.date });
  const ev = refreshDaily(p);
  res.json({ ok: true, status: ev.status, alerts: store.alertsOf(p.id).filter((a) => a.status === "open") });
});

// Minimal CSV reader (quoted fields, commas or semicolons).
function parseCsv(textIn) {
  const lines = textIn.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { header: [], rows: [] };
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = (line) => {
    const out = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
      else if (c === sep && !q) { out.push(cur); cur = "" }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  return { header: split(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z_]/g, "_")), rows: lines.slice(1).map(split) };
}

const HEADER_MAP = {
  date: ["date", "day"],
  sleepHours: ["sleep_hours", "sleep", "sleep_h", "hours_slept", "sleep_duration"],
  sleepQuality: ["sleep_quality", "quality"],
  activeMinutes: ["active_minutes", "activity", "activity_minutes", "exercise", "exercise_minutes", "active_min"],
  steps: ["steps", "step_count"],
  stress: ["stress", "stress_level"],
};

function importHabits(p, csvText) {
  const { header, rows } = parseCsv(csvText);
  const col = Object.fromEntries(Object.entries(HEADER_MAP).map(([k, names]) => [k, header.findIndex((h) => names.includes(h))]));
  if (col.date < 0) throw fail(400, "The CSV needs a 'date' column (YYYY-MM-DD).");
  let imported = 0;
  const skipped = [];
  rows.forEach((r, i) => {
    let date = r[col.date];
    const dm = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(date || "");
    if (dm) date = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`; // DD/MM/YYYY
    if (!validDate(date || "")) { skipped.push({ row: i + 2, reason: "date" }); return; }
    const get = (k) => (col[k] >= 0 ? r[col[k]] : null);
    const v = cleanHabit({ sleepHours: get("sleepHours"), sleepQuality: get("sleepQuality"), activeMinutes: get("activeMinutes"), stress: get("stress") });
    if (v.activeMinutes === null && num(get("steps"), 0, 100000) !== null) v.activeMinutes = Math.round(num(get("steps"), 0, 100000) / 100);
    if (Object.values(v).every((x) => x === null)) { skipped.push({ row: i + 2, reason: "no values" }); return; }
    upsertHabit(p, date, v, "csv");
    imported += 1;
  });
  return { imported, skipped: skipped.length, problems: skipped.slice(0, 5), columns: Object.entries(col).filter(([, i]) => i >= 0).map(([k]) => k) };
}

router.post("/participants/:id/habits/import", csvUpload.single("csvFile"), (req, res) => {
  const p = participantOr404(req.params.id);
  needHabitConsent(p);
  if (!req.file) throw fail(400, "Choose a .csv file.");
  const result = importHabits(p, req.file.buffer.toString("utf8"));
  store.logEvent("habits_imported", { participantId: p.id, imported: result.imported, skipped: result.skipped });
  refreshDaily(p);
  res.json(result);
});

router.get("/habits/template.csv", (req, res) => {
  res.type("text/csv").attachment("earbud-eeg-habits-template.csv")
    .send("date,sleep_hours,sleep_quality,active_minutes,steps,stress\n2026-11-17,7.5,4,35,,2\n2026-11-18,6.0,3,,5200,3\n");
});

// ------------------------------------------------------------------ daily view

router.get("/participants/:id/daily", (req, res) => {
  const p = participantOr404(req.params.id);
  const ev = evaluateDaily({ monitoring: store.monitoringOf(p.id), habits: store.habitsOf(p.id), now: new Date() });
  const days = ev.days.slice(-60).map((d) => ({ date: d.date, minutes: d.minutes, cleanMinutes: d.cleanMinutes, scored: d.scored,
    markers: d.markers, z: d.z || {}, seizureEvents: d.seizureEvents, habits: d.habits }));
  const baseline = ev.baseline ? Object.fromEntries(Object.entries(ev.baseline).map(([k, b]) => [k, { center: b.center, spread: b.spread, model: Boolean(b.model) }])) : null;
  res.json({
    participant: brief(p), status: ev.status, baselineDays: ev.baselineDays ?? null, needed: ev.needed ?? null,
    days, baseline, usualHabits: ev.usualHabits || null, markers: MARKERS,
    alerts: store.alertsOf(p.id).slice(0, 20), tiers: TIERS,
    today: store.habitsOf(p.id).find((h) => h.date === new Date().toISOString().slice(0, 10)) || null,
    monitoring: store.monitoringOf(p.id).slice(-5).reverse().map(({ timeline, ...m }) => m),
  });
});

// ------------------------------------------------------------------ escalation (clinicians)

router.get("/clinician/alerts", (req, res) => {
  if (!isClinician(req)) throw fail(401, "Clinician sign-in required");
  const now = new Date();
  const order = { urgent: 0, review: 1, repeat: 2, info: 3 };
  const withP = (a) => ({ ...a, participant: brief(store.participant(a.participantId)), overdue: overdue(a, now) });
  const all = store.load().alerts;
  res.json({
    open: all.filter((a) => a.status === "open" && a.clinician).map(withP)
      .sort((a, b) => order[a.tier] - order[b.tier] || (a.dueAt || "").localeCompare(b.dueAt || "")),
    recent: all.filter((a) => a.status !== "open").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12).map(withP),
    tiers: TIERS,
  });
});

router.post("/alerts/:id/action", (req, res) => {
  if (!isClinician(req)) throw fail(401, "Clinician sign-in required");
  const a = store.load().alerts.find((x) => x.id === req.params.id);
  if (!a) throw fail(404, "Alert not found");
  const action = String(req.body?.action || "");
  if (!ACTIONS.includes(action)) throw fail(400, "Choose reviewed, escalated, closed or reopened.");
  act(a, action, { by: String(req.body?.reviewer || "Clinician").slice(0, 80), note: req.body?.note });
  store.logEvent("alert_" + action, { alertId: a.id, participantId: a.participantId, tier: a.tier });
  store.save();
  res.json({ alert: a });
});

module.exports = { router, refreshDaily, importHabits, parseCsv };
