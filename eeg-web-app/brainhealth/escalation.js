// Documented clinical escalation pathway (see docs/clinical-escalation.md).
// Each tier says who acts, by when, and what the person is told.
const HOUR = 3600 * 1000;

const TIERS = {
  info: {
    label: "For your information", clinician: false, dueHours: null,
    user: "One lower day is usually noise (sleep, stress, a noisy recording). Nothing to do.",
  },
  repeat: {
    label: "Repeat check", clinician: false, dueHours: 7 * 24,
    user: "Most likely from recent habits. After three normal nights, do a guided 3-minute check within 7 days.",
  },
  review: {
    label: "Clinician review", clinician: true, dueHours: 7 * 24,
    user: "A sustained change that habits do not explain. A clinician will review it within 7 days and may suggest your GP or a neurologist. This is a screening signal, not a diagnosis.",
  },
  urgent: {
    label: "Urgent review", clinician: true, dueHours: 24,
    user: "A clinician will review this within 24 hours. If you have a seizure, are injured, confused or feel unwell, call 998 (UAE ambulance) or go to the nearest emergency department.",
  },
};
const ACTIONS = ["reviewed", "escalated", "closed", "reopened"];

// Turn engine alerts into stored alerts: one open alert per (tier, marker); repeats update it.
function syncAlerts(db, participantId, engineAlerts, now = new Date(), newId) {
  const created = [];
  for (const a of engineAlerts) {
    const open = db.alerts.find((x) => x.participantId === participantId && x.marker === a.marker && x.tier === a.tier && x.status === "open");
    if (open) {
      Object.assign(open, { lines: a.lines, title: a.title, lastSeen: a.date, gap: a.gap ?? null, share: a.share ?? null });
      continue;
    }
    // A closed alert for the same change within the last 7 days suppresses a duplicate.
    const recentClosed = db.alerts.find((x) => x.participantId === participantId && x.marker === a.marker && x.tier === a.tier &&
      x.status !== "open" && now - Date.parse(x.updatedAt || x.createdAt) < 7 * 24 * HOUR);
    if (recentClosed) continue;
    const t = TIERS[a.tier];
    const alert = {
      id: newId("a"), participantId, createdAt: now.toISOString(), updatedAt: now.toISOString(),
      tier: a.tier, marker: a.marker, title: a.title, lines: a.lines, since: a.since, lastSeen: a.date,
      gap: a.gap ?? null, share: a.share ?? null,
      status: "open", clinician: t.clinician,
      dueAt: t.dueHours ? new Date(now.getTime() + t.dueHours * HOUR).toISOString() : null,
      history: [{ at: now.toISOString(), action: "created", by: "system" }],
    };
    db.alerts.push(alert);
    created.push(alert);
  }
  return created;
}

function act(alert, action, { by = "Clinician", note = "", now = new Date() } = {}) {
  if (!ACTIONS.includes(action)) throw new Error("Unknown action");
  alert.history.push({ at: now.toISOString(), action, by, note: String(note || "").slice(0, 500) });
  alert.status = action === "reopened" ? "open" : action;
  alert.updatedAt = now.toISOString();
  return alert;
}

const overdue = (alert, now = new Date()) => alert.status === "open" && alert.dueAt && Date.parse(alert.dueAt) < now.getTime();

module.exports = { TIERS, ACTIONS, syncAlerts, act, overdue };
