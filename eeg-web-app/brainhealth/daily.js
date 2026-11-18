// Continuous-screening engine: daily EEG markers from background sessions, a personal
// baseline, and a small per-person model of how sleep and activity move each marker.
// Every alert carries its own explanation (how much of the change sleep/activity explain).
// Background screening only: nothing here is a diagnosis.

const MARKERS = {
  paf_hz: { label: "Brain rhythm speed", inline: "brain rhythm speed", unit: "Hz", dir: 1, digits: 1, floor: 0.15 },
  theta_alpha_ratio: { label: "Slow-wave balance", inline: "slow-wave balance", unit: "", dir: -1, digits: 2, floor: 0.05 },
  alpha_share: { label: "Relaxed rhythm (alpha share)", inline: "relaxed rhythm", unit: "%", dir: 1, digits: 0, floor: 0.02, scale: 100 },
};
const MIN_CLEAN_MINUTES = 10;   // a day needs this much clean EEG to be scored
const BASELINE_SPAN_DAYS = 14;  // the first two weeks set the personal baseline...
const BASELINE_MIN_DAYS = 7;    // ...from at least this many scored days
const MODEL_MIN_DAYS = 10;      // habit model only with enough paired days
const Z_LOW = -2;               // clearly worse than usual on a day
const DRIFT_MEAN_Z = -1.5;      // or the recent average is well below usual
const HABIT_SHARE = 0.6;        // habits explain >= 60% of the gap -> "repeat", not "review"

const num = (x) => typeof x === "number" && Number.isFinite(x);
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const dayOf = (iso) => String(iso).slice(0, 10);
const addDays = (date, n) => new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// One row per calendar day: clean-minute-weighted markers, seizure events and that day's habits.
function buildDays(monitoring = [], habits = []) {
  const byDay = new Map();
  const row = (date) => {
    if (!byDay.has(date)) byDay.set(date, { date, minutes: 0, cleanMinutes: 0, sums: {}, weights: {}, seizureEvents: 0, sessions: 0, habits: null });
    return byDay.get(date);
  };
  for (const m of monitoring) {
    const r = row(dayOf(m.startedAt));
    r.sessions += 1;
    r.minutes += m.minutes || 0;
    r.cleanMinutes += m.cleanMinutes || 0;
    r.seizureEvents += m.seizure?.events?.length || 0;
    for (const id of Object.keys(MARKERS)) {
      const v = m.markers?.[id];
      if (num(v) && (m.cleanMinutes || 0) > 0) {
        r.sums[id] = (r.sums[id] || 0) + v * m.cleanMinutes;
        r.weights[id] = (r.weights[id] || 0) + m.cleanMinutes;
      }
    }
  }
  for (const h of habits) row(h.date).habits = { sleepHours: h.sleepHours, sleepQuality: h.sleepQuality, activeMinutes: h.activeMinutes, stress: h.stress };
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => {
    const markers = {};
    for (const id of Object.keys(MARKERS)) if (r.weights[id]) markers[id] = r.sums[id] / r.weights[id];
    const { sums, weights, ...rest } = r;
    return { ...rest, markers, scored: r.cleanMinutes >= MIN_CLEAN_MINUTES && Object.keys(markers).length > 0 };
  });
}

// Least squares y ~ a + b*sleep + c*active (tiny ridge for stability). Returns null if not identifiable.
function fitHabits(rows) {
  const X = rows.map((r) => [1, r.sleep, r.active]);
  const XtX = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const Xty = [0, 0, 0];
  rows.forEach((r, i) => {
    for (let a = 0; a < 3; a++) {
      Xty[a] += X[i][a] * r.y;
      for (let b = 0; b < 3; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  });
  XtX[1][1] += 1e-3; XtX[2][2] += 1e-3;
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(XtX);
  if (Math.abs(D) < 1e-9) return null;
  const coef = [0, 1, 2].map((k) => det(XtX.map((rowv, i) => rowv.map((v, j) => (j === k ? Xty[i] : v)))) / D);
  return { a: coef[0], b: coef[1], c: coef[2] };
}

function evaluateDaily({ monitoring = [], habits = [], now = new Date() } = {}) {
  const days = buildDays(monitoring, habits);
  const scored = days.filter((d) => d.scored);
  if (!scored.length) return { status: "no_data", days, baseline: null, alerts: [] };

  const start = scored[0].date;
  const baseDays = scored.filter((d) => d.date < addDays(start, BASELINE_SPAN_DAYS));
  if (baseDays.length < BASELINE_MIN_DAYS || dayOf(now.toISOString()) < addDays(start, BASELINE_SPAN_DAYS)) {
    return { status: "building", baselineDays: baseDays.length, needed: BASELINE_MIN_DAYS, days, baseline: null, alerts: [] };
  }

  const withHabits = baseDays.filter((d) => num(d.habits?.sleepHours) && num(d.habits?.activeMinutes));
  const usualHabits = withHabits.length
    ? { sleepHours: mean(withHabits.map((d) => d.habits.sleepHours)), activeMinutes: mean(withHabits.map((d) => d.habits.activeMinutes)) }
    : null;

  const baseline = {};
  for (const [id, def] of Object.entries(MARKERS)) {
    const vals = baseDays.map((d) => d.markers[id]).filter(num);
    if (vals.length < BASELINE_MIN_DAYS) continue;
    const center = median(vals);
    const spread = Math.max(1.4826 * median(vals.map((v) => Math.abs(v - center))), def.floor);
    const pairs = withHabits.filter((d) => num(d.markers[id])).map((d) => ({ y: d.markers[id], sleep: d.habits.sleepHours, active: d.habits.activeMinutes }));
    const model = pairs.length >= MODEL_MIN_DAYS ? fitHabits(pairs) : null;
    baseline[id] = { center, spread, model, days: vals.length };
  }

  // Score every day after the baseline: raw gap from usual, and the part sleep/activity explain.
  const after = scored.filter((d) => d.date >= addDays(start, BASELINE_SPAN_DAYS));
  for (const d of days) d.z = {};
  for (const d of after) {
    for (const [id, b] of Object.entries(baseline)) {
      const v = d.markers[id];
      if (!num(v)) continue;
      const def = MARKERS[id];
      const sleep = num(d.habits?.sleepHours) ? d.habits.sleepHours : usualHabits?.sleepHours;
      const active = num(d.habits?.activeMinutes) ? d.habits.activeMinutes : usualHabits?.activeMinutes;
      let explained = 0, sleepEffect = 0, activeEffect = 0;
      if (b.model && usualHabits && num(sleep) && num(active)) {
        sleepEffect = b.model.b * (sleep - usualHabits.sleepHours);
        activeEffect = b.model.c * (active - usualHabits.activeMinutes);
        explained = sleepEffect + activeEffect;
      }
      const gap = v - b.center;
      d.z[id] = {
        raw: (def.dir * gap) / b.spread,
        unexplained: (def.dir * (gap - explained)) / b.spread,
        gap, explained, sleepEffect, activeEffect,
      };
    }
  }

  const alerts = [];
  const recent = after.slice(-7);

  // Urgent: any sustained seizure-like event in continuous EEG during the last week.
  const seizureDays = recent.filter((d) => d.seizureEvents > 0);
  if (seizureDays.length) {
    const last = seizureDays.at(-1);
    alerts.push({
      tier: "urgent", marker: "seizure", since: seizureDays[0].date, date: last.date,
      title: "Seizure-like activity in background screening",
      lines: [
        `${seizureDays.reduce((a, d) => a + d.seizureEvents, 0)} sustained seizure-like event${seizureDays.length > 1 || last.seizureEvents > 1 ? "s" : ""} on ${seizureDays.map((d) => d.date).join(", ")}.`,
        "A clinician will review this within 24 hours.",
      ],
    });
  }

  for (const [id, b] of Object.entries(baseline)) {
    const def = MARKERS[id];
    const pts = recent.filter((d) => d.z[id]).map((d) => ({ date: d.date, ...d.z[id], habits: d.habits }));
    if (!pts.length) continue;
    const last5 = pts.slice(-5);
    const lowDays = last5.filter((p) => p.raw <= Z_LOW);
    const meanRaw = mean(pts.map((p) => p.raw));
    const drift = lowDays.length >= 3 || (pts.length >= 4 && meanRaw <= DRIFT_MEAN_Z);
    const fmt = (v) => `${(Math.abs(v) * (def.scale || 1)).toFixed(def.digits)}${def.unit ? (def.unit === "%" ? " points" : " " + def.unit) : ""}`;
    const worse = def.dir > 0 ? "below" : "above";
    if (drift) {
      const span = lowDays.length >= 3 ? lowDays : pts;
      const gap = mean(span.map((p) => p.gap));
      const explained = mean(span.map((p) => p.explained));
      const share = def.dir * gap < 0 ? Math.max(0, Math.min(1, explained / gap)) : 0;
      const sleepAvg = span.map((p) => p.habits?.sleepHours).filter(num);
      const actAvg = span.map((p) => p.habits?.activeMinutes).filter(num);
      const contributions = [];
      if (b.model && usualHabits) {
        const se = mean(span.map((p) => p.sleepEffect)), ae = mean(span.map((p) => p.activeEffect));
        if (sleepAvg.length && Math.abs(se) > 0.0001) contributions.push({ habit: "sleep", value: mean(sleepAvg), usual: usualHabits.sleepHours, effect: se });
        if (actAvg.length && Math.abs(ae) > 0.0001) contributions.push({ habit: "activity", value: mean(actAvg), usual: usualHabits.activeMinutes, effect: ae });
      }
      const tier = share >= HABIT_SHARE ? "repeat" : "review";
      const lines = [`${def.label} has been ${fmt(gap)} ${worse} your usual on ${lowDays.length >= 3 ? `${lowDays.length} of the last ${last5.length}` : `average over the last ${pts.length}`} days.`];
      for (const c of contributions) {
        // Only habits that pushed the marker the worse way, by a noticeable amount.
        if (def.dir * c.effect >= 0 || Math.abs(c.effect) < 0.1 * Math.abs(gap)) continue;
        const less = c.value < c.usual;
        lines.push(c.habit === "sleep"
          ? `${less ? "Shorter" : "Longer"} sleep (${c.value.toFixed(1)} h vs your usual ${c.usual.toFixed(1)} h) explains about ${fmt(c.effect)} of this.`
          : `${less ? "Less" : "More"} activity (${Math.round(c.value)} vs your usual ${Math.round(c.usual)} active minutes) explains about ${fmt(c.effect)} of this.`);
      }
      const habitsHelped = def.dir * explained >= 0; // habits were normal or better: they explain none of it
      const rest = habitsHelped ? gap : gap - explained;
      if (tier === "review") {
        lines.push(habitsHelped || Math.abs(rest) >= Math.abs(gap) * 0.95
          ? "Your sleep and activity were normal, so they do not explain this change."
          : `About ${fmt(rest)} is not explained by sleep or activity.`);
      }
      else lines.push("Most of this matches your recent habits, so it is likely temporary.");
      alerts.push({
        tier, marker: id, since: span[0].date, date: pts.at(-1).date,
        title: tier === "review" ? `${def.label}: a sustained change` : `${def.label}: lower, probably from recent habits`,
        gap, explained, share, contributions, lines,
      });
    } else if (pts.at(-1).raw <= Z_LOW) {
      const p = pts.at(-1);
      alerts.push({
        tier: "info", marker: id, since: p.date, date: p.date,
        title: `${def.label}: one lower day`,
        gap: p.gap, explained: p.explained,
        lines: [`${def.label} was ${fmt(p.gap)} ${worse} your usual on ${p.date}. One day alone is usually noise.`],
      });
    }
  }

  const order = { urgent: 0, review: 1, repeat: 2, info: 3 };
  alerts.sort((a, b) => order[a.tier] - order[b.tier]);
  return { status: "ok", days, baseline, usualHabits, alerts };
}

module.exports = { evaluateDaily, buildDays, fitHabits, MARKERS, MIN_CLEAN_MINUTES, BASELINE_SPAN_DAYS };
