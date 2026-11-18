const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateDaily } = require("./daily");
const { syncAlerts, act, overdue, TIERS } = require("./escalation");

const noise = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return (x - Math.floor(x)) - 0.5 };
const date = (i) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);

// A person with `n` days of background sessions and habits. `sleepAt(i)` and `pafAt(i, sleep)` shape the story.
function person({ n = 35, sleepAt = (i) => 7 + noise(i, 1) * 2, activeAt = (i) => 40 + noise(i, 2) * 30,
  pafAt = (i, sleep) => 10 + 0.15 * (sleep - 7) + noise(i, 3) * 0.1, cleanAt = () => 40, seizureOn = -1 } = {}) {
  const monitoring = [], habits = []
  for (let i = 0; i < n; i++) {
    const sleep = sleepAt(i), active = activeAt(i)
    habits.push({ date: date(i), sleepHours: sleep, activeMinutes: active, sleepQuality: 3, stress: 2 })
    monitoring.push({
      startedAt: `${date(i)}T10:00:00.000Z`, minutes: 60, cleanMinutes: cleanAt(i),
      markers: { paf_hz: pafAt(i, sleep), theta_alpha_ratio: 0.6 + noise(i, 4) * 0.04, alpha_share: 0.3 + noise(i, 5) * 0.02 },
      seizure: { events: i === seizureOn ? [{ start_s: 600, end_s: 640, peak: 0.97 }] : [] },
    })
  }
  return { monitoring, habits, now: new Date(`${date(n - 1)}T20:00:00Z`) }
}

test("a stable person gets no alert", () => {
  const r = evaluateDaily(person())
  assert.equal(r.status, "ok")
  assert.deepEqual(r.alerts, [])
})

test("too little data keeps building the baseline", () => {
  const r = evaluateDaily(person({ n: 5 }))
  assert.equal(r.status, "building")
})

test("a dip explained by short sleep is a repeat, with the explanation", () => {
  const r = evaluateDaily(person({ sleepAt: (i) => (i >= 30 ? 4.3 : 7 + noise(i, 1) * 2) }))
  const a = r.alerts.find((x) => x.marker === "paf_hz")
  assert.ok(a, "expected a brain-rhythm alert")
  assert.equal(a.tier, "repeat")
  assert.ok(a.share >= 0.6)
  assert.ok(a.lines.some((l) => /Shorter sleep \(4\.3 h/.test(l)), a.lines.join(" | "))
})

test("an unexplained sustained drop is a clinician review", () => {
  const r = evaluateDaily(person({ pafAt: (i, sleep) => 10 + 0.15 * (sleep - 7) + noise(i, 3) * 0.1 - (i >= 29 ? 0.6 : 0) }))
  const a = r.alerts.find((x) => x.marker === "paf_hz")
  assert.equal(a.tier, "review")
  assert.ok(a.lines.some((l) => /not explained by sleep or activity|do not explain this change/.test(l)), a.lines.join(" | "))
  assert.equal(TIERS.review.clinician, true)
})

test("a sustained seizure-like event is urgent and comes first", () => {
  const r = evaluateDaily(person({ seizureOn: 33 }))
  assert.equal(r.alerts[0].tier, "urgent")
  assert.equal(r.alerts[0].marker, "seizure")
})

test("days without enough clean EEG are not scored", () => {
  const r = evaluateDaily(person({ cleanAt: (i) => (i >= 30 ? 4 : 40), pafAt: (i, s) => (i >= 30 ? 8 : 10 + 0.15 * (s - 7) + noise(i, 3) * 0.1) }))
  assert.deepEqual(r.alerts, [])
})

test("escalation: one open alert per change, due dates by tier, actions are logged", () => {
  const db = { alerts: [] }
  let n = 0
  const newId = () => `a_${++n}`
  const now = new Date("2026-11-01T10:00:00Z")
  const engine = [{ tier: "urgent", marker: "seizure", title: "t", lines: ["x"], since: "2026-11-01", date: "2026-11-01" },
    { tier: "review", marker: "paf_hz", title: "t", lines: ["y"], since: "2026-10-28", date: "2026-11-01" }]
  assert.equal(syncAlerts(db, "p1", engine, now, newId).length, 2)
  assert.equal(syncAlerts(db, "p1", engine, now, newId).length, 0) // no duplicates
  const urgent = db.alerts.find((a) => a.tier === "urgent")
  assert.equal(Date.parse(urgent.dueAt) - now.getTime(), 24 * 3600 * 1000)
  assert.ok(overdue(urgent, new Date("2026-11-02T11:00:00Z")))
  act(urgent, "escalated", { by: "Dr A", note: "Neurology referral", now })
  assert.equal(urgent.status, "escalated")
  assert.equal(urgent.history.at(-1).by, "Dr A")
  assert.equal(syncAlerts(db, "p1", engine, now, newId).length, 0) // handled recently, not re-raised
})
