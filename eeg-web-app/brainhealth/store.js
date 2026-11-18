// Local storage, encrypted at rest (AES-256-GCM, see secure.js). Everything stays on
// this machine in one file, written atomically. An older plaintext store.json is
// migrated on first load and then removed.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const secure = require("./secure");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "store.enc");
const LEGACY = path.join(DATA_DIR, "store.json");
const EMPTY = () => ({ participants: [], sessions: [], events: [], monitoring: [], habits: [], alerts: [] });

let db = null;
let timer = null;

function load() {
  if (db) return db;
  if (fs.existsSync(FILE)) {
    db = JSON.parse(secure.decryptFile(FILE).toString("utf8"));
  } else if (fs.existsSync(LEGACY)) {
    db = JSON.parse(fs.readFileSync(LEGACY, "utf8"));
    persistNow(); // encrypt now, then the plaintext copy is deleted
  } else {
    db = EMPTY();
  }
  for (const [k, v] of Object.entries(EMPTY())) if (!Array.isArray(db[k])) db[k] = v;
  return db;
}

function persistNow() {
  clearTimeout(timer);
  timer = null;
  if (!db) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, secure.encrypt(Buffer.from(JSON.stringify(db), "utf8")));
  fs.renameSync(tmp, FILE);
  fs.rmSync(LEGACY, { force: true });
}

function save() {
  clearTimeout(timer);
  timer = setTimeout(persistNow, 200);
}

const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

function logEvent(type, details = {}) {
  load().events.push({ id: newId("e"), at: new Date().toISOString(), type, ...details });
  save();
}

const participant = (id) => load().participants.find((p) => p.id === id) || null;
const session = (id) => load().sessions.find((s) => s.id === id) || null;
const sessionsOf = (participantId) =>
  load().sessions.filter((s) => s.participantId === participantId).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
const monitoringOf = (participantId) =>
  load().monitoring.filter((m) => m.participantId === participantId).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
const habitsOf = (participantId) =>
  load().habits.filter((h) => h.participantId === participantId).sort((a, b) => a.date.localeCompare(b.date));
const alertsOf = (participantId) =>
  load().alerts.filter((a) => a.participantId === participantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

module.exports = { load, save, flush: persistNow, newId, logEvent, participant, session, sessionsOf, monitoringOf, habitsOf, alertsOf, FILE, DATA_DIR };
