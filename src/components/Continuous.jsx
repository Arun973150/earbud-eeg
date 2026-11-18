import { useEffect, useRef, useState } from 'react'
import { Link } from '../router.jsx'
import { Choices } from './ui.jsx'
import { useHover, svgX, Tooltip } from './Charts.jsx'
import { api } from '../api.js'
import { fmtDate } from '../copy.js'

/* ------------------------------------------------------------------ alerts */

export const TIER_UI = {
  urgent: { tone: 'critical', icon: '!', label: 'Urgent review' },
  review: { tone: 'serious', icon: '◆', label: 'Clinician review' },
  repeat: { tone: 'warning', icon: '△', label: 'Repeat check' },
  info: { tone: 'neutral', icon: 'i', label: 'For your information' },
}

const STATUS_TEXT = { reviewed: 'Reviewed by a clinician', escalated: 'Referred by a clinician', closed: 'Closed by a clinician' }

export function TierChip({ tier }) {
  const t = TIER_UI[tier] || TIER_UI.info
  return (
    <span className={`chip tone-${t.tone}`}>
      <span className="chip__icon" aria-hidden="true">{t.icon}</span>
      {t.label}
    </span>
  )
}

export function AlertCard({ alert, tiers, compact = false }) {
  const next = tiers?.[alert.tier]?.user
  const last = alert.history?.at(-1)
  return (
    <article className={`alert-card alert-card--${alert.tier}`}>
      <div className="row row--between">
        <TierChip tier={alert.tier} />
        <span className="mono muted">{fmtDate(alert.createdAt)}</span>
      </div>
      <h3 className="alert-card__title">{alert.title}</h3>
      <ul className="bullets">{alert.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      {!compact && (
        <div className="alert-card__next">
          <span className="mono">What happens next</span>
          <p>{alert.status === 'open' ? next : `${STATUS_TEXT[alert.status] || 'Updated'} on ${fmtDate(last?.at)}${last?.note ? `: “${last.note}”` : '.'}`}</p>
          {alert.status === 'open' && alert.dueAt && alert.clinician && <p className="mono muted">Clinician review due by {fmtDate(alert.dueAt)}</p>}
        </div>
      )}
      <p className="alert-card__small">Background screening, not a diagnosis.</p>
    </article>
  )
}

/* ------------------------------------------------------------------ daily check-in */

const SLEEP = [[4, '4 h'], [5, '5 h'], [6, '6 h'], [7, '7 h'], [8, '8 h'], [9, '9 h+']]
const QUALITY = [[1, 'Bad'], [2, 'Poor'], [3, 'OK'], [4, 'Good'], [5, 'Great']]
const ACTIVE = [[0, 'None'], [15, '15 min'], [30, '30 min'], [60, '1 h'], [90, '1.5 h+']]
const STRESS = [[1, 'Calm'], [2, 'Low'], [3, 'Some'], [4, 'High'], [5, 'Very high']]

export function TodayCheckin({ pid, today, onSaved }) {
  const [v, setV] = useState({
    sleepHours: today?.sleepHours ?? null, sleepQuality: today?.sleepQuality ?? null,
    activeMinutes: today?.activeMinutes ?? null, stress: today?.stress ?? null,
  })
  const [state, setState] = useState(today ? 'saved' : 'idle')
  const [error, setError] = useState(null)
  const set = (k) => (x) => { setV((o) => ({ ...o, [k]: x })); setState('idle') }
  const nearest = (opts, x) => (x == null ? null : opts.reduce((b, [o]) => (Math.abs(o - x) < Math.abs(b - x) ? o : b), opts[0][0]))
  const save = async () => {
    setError(null)
    try {
      await api.put(`/api/participants/${pid}/habits/${new Date().toISOString().slice(0, 10)}`, v)
      setState('saved')
      onSaved?.()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <section className="panel checkin">
      <p className="panel__eyebrow">Today · 20 seconds</p>
      <h2 className="panel__title">How did you sleep and move?</h2>
      <p className="panel__text">Your brain rhythms change with sleep and activity. Telling us helps explain your results.</p>
      <div className="checkin__grid">
        <Choices legend="Sleep last night" name="ci-sleep" value={nearest(SLEEP, v.sleepHours)} onChange={set('sleepHours')} options={SLEEP} />
        <Choices legend="Sleep quality" name="ci-quality" value={v.sleepQuality} onChange={set('sleepQuality')} options={QUALITY} />
        <Choices legend="Active today" name="ci-active" value={nearest(ACTIVE, v.activeMinutes)} onChange={set('activeMinutes')} options={ACTIVE} />
        <Choices legend="Stress" name="ci-stress" value={v.stress} onChange={set('stress')} options={STRESS} />
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="row" style={{ marginTop: 'var(--sp-16)' }}>
        <button className="pill pill--solid" onClick={save} disabled={Object.values(v).every((x) => x == null)}>
          {state === 'saved' ? 'Saved ✓' : 'Save today'}
        </button>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ daily chart: marker over habits */

const W = 640

// Three small charts on one time axis: the marker against your usual band, then sleep, then activity.
export function DailyChart({ data, marker = 'paf_hz' }) {
  const svgRef = useRef(null)
  const days = data.days || []
  const hover = useHover(days.length)
  const def = data.markers?.[marker]
  const base = data.baseline?.[marker]
  if (!days.length || !def) return null
  const scale = def.scale || 1
  const vals = days.map((d) => d.markers?.[marker]).filter((x) => typeof x === 'number')
  if (!vals.length) return null
  const band = base ? [base.center - 2 * base.spread, base.center + 2 * base.spread] : null
  let lo = Math.min(...vals, ...(band || [])), hi = Math.max(...vals, ...(band || []))
  const pad = (hi - lo) * 0.15 || 0.2
  lo -= pad; hi += pad
  const m = { l: 56, r: 14 }
  const H1 = 170, H2 = 64, H3 = 64, GAP = 26, top1 = 14, top2 = top1 + H1 + GAP, top3 = top2 + H2 + GAP, height = top3 + H3 + 26
  const slot = (W - m.l - m.r) / days.length
  const x = (i) => m.l + slot * (i + 0.5)
  const y = (v) => top1 + (1 - (v - lo) / (hi - lo)) * H1
  const maxSleep = 10, maxAct = Math.max(60, ...days.map((d) => d.habits?.activeMinutes || 0))
  const pts = days.map((d, i) => (typeof d.markers?.[marker] === 'number' ? [x(i), y(d.markers[marker]), i] : null)).filter(Boolean)
  const path = pts.map(([px, py], k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const lowDay = (d) => (d.z?.[marker]?.raw ?? 0) <= -2
  const fmt = (v) => `${(v * scale).toFixed(def.digits)}${def.unit && def.unit !== '%' ? ' ' + def.unit : def.unit}`
  const a = hover.index
  const ad = a !== null ? days[a] : null
  const tick = days.length > 1 ? [0, Math.floor(days.length / 2), days.length - 1] : [0]

  return (
    <div className="chart-wrap">
      <svg ref={svgRef} className="chart" viewBox={`0 0 ${W} ${height}`} tabIndex={0} role="img"
        aria-label={`${def.label} each day for ${days.length} days with sleep and activity below.`}
        onPointerMove={(e) => hover.setIndex(Math.max(0, Math.min(days.length - 1, Math.floor((svgX(e, svgRef.current) - m.l) / slot))))}
        onPointerLeave={hover.onPointerLeave} onKeyDown={hover.onKeyDown} onBlur={hover.onBlur}>
        <text x={m.l} y={top1 - 2}>{def.label}</text>
        {band && <rect x={m.l} y={y(band[1])} width={W - m.l - m.r} height={y(band[0]) - y(band[1])} fill="var(--series-1)" opacity="0.12" rx="4" />}
        {base && <line x1={m.l} x2={W - m.r} y1={y(base.center)} y2={y(base.center)} stroke="var(--series-1)" strokeDasharray="4 4" opacity="0.6" />}
        {[lo + pad, hi - pad].map((v) => <text key={v} x={m.l - 8} y={y(v) + 3.5} textAnchor="end">{fmt(v)}</text>)}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
        {pts.map(([px, py, i]) => (
          <circle key={i} cx={px} cy={py} r={lowDay(days[i]) ? 5 : 3.5} fill={lowDay(days[i]) ? 'var(--status-serious)' : 'var(--series-1)'} stroke="#0b0b0b" strokeWidth="1.5" />
        ))}
        {days.map((d, i) => d.seizureEvents > 0 && (
          <g key={`s${i}`}><line x1={x(i)} x2={x(i)} y1={top1} y2={top1 + H1} stroke="var(--status-critical)" strokeWidth="2" /><text x={x(i) + 4} y={top1 + 12} style={{ fill: 'var(--status-critical)' }}>seizure-like</text></g>
        ))}

        <text x={m.l} y={top2 - 4}>Sleep (hours)</text>
        {days.map((d, i) => typeof d.habits?.sleepHours === 'number' && (
          <rect key={`sl${i}`} x={x(i) - slot * 0.35} width={slot * 0.7} rx="2"
            y={top2 + H2 * (1 - Math.min(d.habits.sleepHours, maxSleep) / maxSleep)} height={H2 * Math.min(d.habits.sleepHours, maxSleep) / maxSleep}
            fill="var(--series-2)" opacity={a === null || a === i ? 0.85 : 0.45} />
        ))}
        <line className="axis-line" x1={m.l} x2={W - m.r} y1={top2 + H2} y2={top2 + H2} />
        {data.usualHabits && <line x1={m.l} x2={W - m.r} y1={top2 + H2 * (1 - data.usualHabits.sleepHours / maxSleep)} y2={top2 + H2 * (1 - data.usualHabits.sleepHours / maxSleep)} stroke="var(--series-2)" strokeDasharray="4 4" opacity="0.7" />}

        <text x={m.l} y={top3 - 4}>Active minutes</text>
        {days.map((d, i) => typeof d.habits?.activeMinutes === 'number' && (
          <rect key={`ac${i}`} x={x(i) - slot * 0.35} width={slot * 0.7} rx="2"
            y={top3 + H3 * (1 - Math.min(d.habits.activeMinutes, maxAct) / maxAct)} height={H3 * Math.min(d.habits.activeMinutes, maxAct) / maxAct}
            fill="var(--status-good)" opacity={a === null || a === i ? 0.75 : 0.4} />
        ))}
        <line className="axis-line" x1={m.l} x2={W - m.r} y1={top3 + H3} y2={top3 + H3} />
        {tick.map((i) => <text key={i} x={x(i)} y={height - 6} textAnchor="middle">{days[i].date.slice(5)}</text>)}
        {a !== null && <line className="crosshair" x1={x(a)} x2={x(a)} y1={top1} y2={top3 + H3} />}
      </svg>
      {ad && (
        <Tooltip x={x(a)} y={typeof ad.markers?.[marker] === 'number' ? y(ad.markers[marker]) : top1 + 40} height={height} width={230}>
          <div className="chart-tip__head">{ad.date}</div>
          {typeof ad.markers?.[marker] === 'number'
            ? <div className="chart-tip__row"><span className="key" style={{ '--key': 'var(--series-1)' }} /><strong>{fmt(ad.markers[marker])}</strong> <span className="muted">{ad.cleanMinutes} clean min</span></div>
            : <div className="chart-tip__row muted">{ad.cleanMinutes ? `Only ${ad.cleanMinutes} clean minutes: not scored` : 'No background session'}</div>}
          {ad.z?.[marker] && Math.abs(ad.z[marker].explained) > 0.001 && (
            <div className="chart-tip__row muted">habits explain {fmt(Math.abs(ad.z[marker].explained))}</div>
          )}
          {ad.habits && <div className="chart-tip__row"><span className="key" style={{ '--key': 'var(--series-2)' }} />{ad.habits.sleepHours ?? '–'} h sleep · {ad.habits.activeMinutes ?? '–'} active min</div>}
        </Tooltip>
      )}
      <div className="legend" style={{ marginTop: 'var(--sp-8)' }}>
        <span><span className="swatch" style={{ '--key': 'var(--series-1)' }} /> Your usual range</span>
        <span><span className="key" style={{ '--key': 'var(--status-serious)' }} /> Clearly below usual</span>
        <span><span className="key" style={{ '--key': 'var(--series-2)' }} /> Sleep</span>
        <span><span className="key" style={{ '--key': 'var(--status-good)' }} /> Activity</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ sections used by pages */

export function HabitImport({ pid, onImported }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const send = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null); setResult(null)
    const form = new FormData()
    form.append('csvFile', file)
    try {
      setResult(await api.post(`/api/participants/${pid}/habits/import`, form))
      onImported?.()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
    e.target.value = ''
  }
  return (
    <section className="panel" style={{ marginBottom: 'var(--sp-24)' }}>
      <p className="panel__eyebrow">From your phone or watch</p>
      <h2 className="panel__title">Import sleep and activity</h2>
      <p className="panel__text">
        Export a CSV from your health app with a date column and any of: sleep hours, sleep quality, active minutes, steps, stress.
        {' '}<a href="/api/habits/template.csv" style={{ textDecoration: 'underline' }}>Download a template</a>.
      </p>
      <label className="pill" style={{ marginTop: 'var(--sp-12)', cursor: 'pointer' }}>
        {busy ? 'Importing…' : 'Choose CSV file'}
        <input type="file" accept=".csv,text/csv" onChange={send} style={{ display: 'none' }} />
      </label>
      {result && (
        <p className="panel__text" style={{ marginTop: 'var(--sp-12)' }}>
          Imported {result.imported} day{result.imported === 1 ? '' : 's'}{result.skipped ? `, skipped ${result.skipped} row${result.skipped === 1 ? '' : 's'} (${result.problems.map((p) => `row ${p.row}: ${p.reason}`).join(', ')})` : ''}.
        </p>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
    </section>
  )
}

export function DailySection({ data }) {
  if (!data || data.status === 'no_data') return null
  return (
    <div className="stack stack--lg" style={{ marginBottom: 'var(--sp-32)' }}>
      <p className="kicker">Background screening · daily</p>
      {data.status === 'building' && (
        <p className="panel__text">Building your baseline: {data.baselineDays} of {data.needed} days with enough clean EEG.</p>
      )}
      <div className="grid-2">
        {Object.keys(data.markers).filter((k) => data.days.some((d) => typeof d.markers?.[k] === 'number')).map((k) => (
          <section className="panel" key={k}>
            <h3 className="panel__title" style={{ marginBottom: 'var(--sp-12)' }}>{data.markers[k].label}</h3>
            <DailyChart data={data} marker={k} />
          </section>
        ))}
      </div>
    </div>
  )
}

// Home-page block: open alerts, today's check-in, start background screening, the rhythm-speed trend.
export function ContinuousHome({ pid, consent }) {
  const [tick, setTick] = useState(0)
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    api.get(`/api/participants/${pid}/daily`).then((d) => live && setData(d)).catch(() => live && setData(null))
    return () => { live = false }
  }, [pid, tick])
  const open = (data?.alerts || []).filter((a) => a.status === 'open')
  const handled = (data?.alerts || []).filter((a) => a.status !== 'open').slice(0, 1)
  const latest = data?.monitoring?.[0]
  return (
    <div className="stack stack--lg" style={{ marginBottom: 'var(--sp-32)' }}>
      {open.map((a) => <AlertCard key={a.id} alert={a} tiers={data.tiers} />)}
      {handled.map((a) => <AlertCard key={a.id} alert={a} tiers={data.tiers} />)}
      <div className="grid-2">
        <section className="panel">
          <p className="panel__eyebrow">Background screening</p>
          <h2 className="panel__title">Wear it while you study or listen</h2>
          <p className="panel__text">
            {latest
              ? `Last session: ${latest.cleanMinutes} clean minutes of ${latest.minutes}, ${latest.markers?.paf_hz ?? '—'} Hz, ${latest.seizure?.events?.length ? 'seizure-like activity found' : 'no seizure-like activity'}.`
              : 'Record for as long as you wear the earbud. Only the still, clean minutes are used.'}
          </p>
          <Link className="pill pill--solid" to={`/app/p/${pid}/monitor`} style={{ marginTop: 'var(--sp-16)' }}>
            Start background screening
          </Link>
        </section>
        {consent?.riskFactors && <TodayCheckin pid={pid} today={data?.today} onSaved={() => setTick((t) => t + 1)} key={data?.today ? 'saved' : 'new'} />}
      </div>
      {data?.days?.some((d) => typeof d.markers?.paf_hz === 'number') && (
        <section className="panel">
          <p className="panel__eyebrow">Last {data.days.length} days</p>
          <h2 className="panel__title">Your brain rhythm with your sleep and activity</h2>
          <DailyChart data={data} marker="paf_hz" />
        </section>
      )}
    </div>
  )
}

export function AlertsQueue() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)
  const [note, setNote] = useState({})
  useEffect(() => {
    api.get('/api/clinician/alerts').then(setData).catch((err) => setError(err.message))
  }, [tick])
  const act = async (a, action) => {
    await api.post(`/api/alerts/${a.id}/action`, { action, note: note[a.id] || '', reviewer: 'Clinician' })
    setTick((t) => t + 1)
  }
  if (error) return <p className="error-text">{error}</p>
  if (!data) return null
  const due = (a) => {
    const h = (Date.parse(a.dueAt) - Date.now()) / 3600000
    return a.overdue ? `Overdue by ${Math.round(-h)} h` : h < 48 ? `Due in ${Math.max(0, Math.round(h))} h` : `Due in ${Math.round(h / 24)} days`
  }
  return (
    <section className="panel">
      <p className="panel__eyebrow">Background screening alerts</p>
      <h2 className="panel__title">{data.open.length} open</h2>
      <p className="panel__text" style={{ marginBottom: 'var(--sp-12)' }}>Urgent first (24 h), then clinician reviews (7 days). Each alert explains what changed and how much sleep and activity account for.</p>
      <div className="stack">
        {data.open.length === 0 && <p className="panel__text muted">Nothing open.</p>}
        {data.open.map((a) => (
          <div key={a.id} className={`alert-card alert-card--${a.tier}`}>
            <div className="row row--between">
              <span className="list-row__title" style={{ fontSize: 'var(--text-body)' }}>{a.participant.code} · {a.participant.age} yrs</span>
              <span className={`mono ${a.overdue ? 'error-text' : 'muted'}`}>{due(a)}</span>
            </div>
            <div style={{ marginTop: 8 }}><TierChip tier={a.tier} /></div>
            <h3 className="alert-card__title">{a.title}</h3>
            <ul className="bullets">{a.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <input className="input" placeholder="Note (optional)" value={note[a.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [a.id]: e.target.value }))} style={{ marginTop: 'var(--sp-12)' }} />
            <div className="row" style={{ marginTop: 'var(--sp-12)' }}>
              <button className="pill pill--solid" onClick={() => act(a, 'reviewed')}>Reviewed</button>
              <button className="pill" onClick={() => act(a, 'escalated')}>Escalate to referral</button>
              <button className="pill pill--quiet" onClick={() => act(a, 'closed')}>Close</button>
            </div>
          </div>
        ))}
      </div>
      {data.recent.length > 0 && (
        <div className="list" style={{ marginTop: 'var(--sp-20)' }}>
          {data.recent.map((a) => (
            <div className="list-row" key={a.id}>
              <div>
                <div className="list-row__title" style={{ fontSize: 'var(--text-body)' }}>{a.participant.code} · {a.title}</div>
                <div className="list-row__meta">{a.status} by {a.history.at(-1)?.by} · {fmtDate(a.updatedAt)}{a.history.at(-1)?.note ? ` · “${a.history.at(-1).note}”` : ''}</div>
              </div>
              <TierChip tier={a.tier} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ minute strip for one session */

export function MinuteStrip({ timeline = [], total }) {
  const n = Math.max(timeline.length, total || 0)
  if (!n) return null
  return (
    <div className="minute-strip" role="img" aria-label={`${timeline.filter((s) => s.clean).length} clean minutes of ${timeline.length}`}>
      {Array.from({ length: n }, (_, i) => {
        const s = timeline[i]
        const cls = !s ? 'is-empty' : (s.seizure_max ?? 0) > 0.85 ? 'is-alert' : s.clean ? 'is-clean' : 'is-noisy'
        return <span key={i} className={cls} title={s ? `Minute ${s.minute}: ${s.clean ? 'clean' : 'movement or noise'}${s.markers ? ` · ${s.markers.paf_hz} Hz` : ''}` : ''} />
      })}
    </div>
  )
}
