// Local JSON storage. Everything stays on this machine (one file, written atomically).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "store.json");

let db = null;
let timer = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    db = { participants: [], sessions: [], events: [] };
  }
  return db;
}

function persistNow() {
  clearTimeout(timer);
  timer = null;
  if (!db) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
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

module.exports = { load, save, flush: persistNow, newId, logEvent, participant, session, sessionsOf, FILE };
