import { useMemo, useRef, useState } from 'react'
import { useHover, svgX, Tooltip, niceTicks } from './Charts.jsx'
import { StatusChip } from './ui.jsx'
import { pct } from '../copy.js'

const W = 640
const SURFACE = '#0b0b0b'
// Single-hue ember ramp for the spectrogram, validated on the void surface (dataviz --ordinal)
const RAMP = ['#5e3d14', '#7f5419', '#a36b20', '#c78631', '#e2a552', '#f5cb8a']

function TableToggle({ open, onToggle }) {
  return (
    <button type="button" className="pill pill--quiet no-print" onClick={onToggle} aria-pressed={open}>
      {open ? 'Show chart' : 'Show table'}
    </button>
  )
}

function Explain({ children }) {
  return <p className="viz-explain">{children}</p>
}

/* ------------------------------------------------------------------ verdict */

export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

// Where the highest window sits on a 0-100% track with the 50% and 85% marks.
function ProbabilityGauge({ value }) {
  const pctX = (v) => `${Math.max(0, Math.min(1, v)) * 100}%`
  const tone = value > 0.85 ? 'critical' : value > 0.5 ? 'warning' : 'good'
  return (
    <div className="gauge" role="img" aria-label={`Highest window probability ${pct(value)}, alert line at 85%.`}>
      <div className="gauge__track">
        <span className="gauge__zone gauge__zone--mid" style={{ left: '50%', width: '35%' }} />
        <span className="gauge__zone gauge__zone--high" style={{ left: '85%', width: '15%' }} />
        <span className="gauge__mark" style={{ left: '50%' }} />
        <span className="gauge__mark" style={{ left: '85%' }} />
        <span className={`gauge__dot tone-${tone}`} style={{ left: pctX(value) }} />
      </div>
      <div className="gauge__labels">
        <span>0%</span><span style={{ left: '50%' }}>50%</span><span style={{ left: '85%' }}>alert 85%</span><span>100%</span>
      </div>
      <p className="gauge__caption">Highest 4-second window: <strong>{pct(value)}</strong></p>
    </div>
  )
}

export function SeizureVerdict({ screen, quality }) {
  if (!screen) {
    return (
      <div className="verdict verdict--neutral">
        <span className="verdict__icon" aria-hidden="true">–</span>
        <div>
          <p className="verdict__title">Seizure screen not run</p>
          <p className="verdict__text">{quality === 'poor' ? 'The signal was too noisy to screen reliably. Reseat the earbud and record again.' : 'No seizure screen for this recording.'}</p>
        </div>
      </div>
    )
  }
  if (screen.pending) {
    return (
      <div className="verdict verdict--neutral">
        <span className="verdict__icon" aria-hidden="true">…</span>
        <div>
          <p className="verdict__title">Seizure screen: with your clinician</p>
          <p className="verdict__text">A qualified clinician is reviewing this recording and will explain the result.</p>
        </div>
      </div>
    )
  }
  const flagged = screen.decision === 'SEIZURE'
  const events = screen.events || []
  const spikes = screen.isolated_spikes || 0
  return (
    <div className={`verdict ${flagged ? 'verdict--alert' : 'verdict--clear'}`}>
      <span className="verdict__icon" aria-hidden="true">{flagged ? '!' : '✓'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="verdict__title">
          {flagged ? `${events.length} possible seizure event${events.length === 1 ? '' : 's'}` : 'No seizure-like activity'}
        </p>
        <p className="verdict__text">
          {flagged
            ? events.map((e) => `${mmss(e.start_s)}–${mmss(e.end_s)} (peak ${pct(e.peak)})`).join(' · ') + '. Each is a stretch worth showing a doctor, not a diagnosis.'
            : `All ${screen.windows} four-second windows checked. Nothing stayed high long enough to count as an event.`}
          {spikes > 0 && ` ${spikes} brief single-window spike${spikes === 1 ? '' : 's'} too short to count, usually noise.`}
        </p>
        {typeof screen.probability_max === 'number' && <ProbabilityGauge value={screen.probability_max} />}
        <p className="verdict__small">{screen.rule || 'Flagged only when 3+ consecutive 4-second windows are above 85%.'}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ seizure timeline */

export function SeizureTimeline({ screen, eyesOpenAt, height = 200, bare = false, lineMode = false }) {
  const svgRef = useRef(null)
  const probs = screen?.window_probabilities
  const hover = useHover(probs?.length || 0)
  const [table, setTable] = useState(false)
  if (!probs?.length) return null
  const step = screen.window_step_s || 2
  const events = screen.events || []
  const m = { l: 44, r: 16, t: 14, b: 30 }
  const total = probs.length * step + (screen.window_seconds || 4) - step
  const long = lineMode || probs.length > 90
  const slot = (W - m.l - m.r) / probs.length
  const bar = Math.min(24, slot - 2)
  const xi = (i) => m.l + i * slot + (long ? slot / 2 : (slot - bar) / 2)
  const xt = (t) => m.l + (t / total) * (W - m.l - m.r)
  const y = (p) => m.t + (1 - p) * (height - m.t - m.b)
  const tone = (p) => (p > 0.85 ? 'critical' : p > 0.5 ? 'warning' : 'good')
  const active = hover.index
  const fmt = total > 120 ? mmss : (t) => `${Math.round(t)} s`
  const area = long
    ? `M${xi(0)},${y(0)} ` + probs.map((p, i) => `L${xi(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ') + ` L${xi(probs.length - 1)},${y(0)} Z`
    : null

  const Wrap = bare ? 'div' : 'section'
  return (
    <Wrap className={bare ? undefined : 'panel'}>
      {!bare && <div className="viz-head">
        <div>
          <p className="panel__eyebrow">Seizure screen over time</p>
          <h3 className="panel__title">{events.length ? `${events.length} sustained high stretch${events.length === 1 ? '' : 'es'}` : 'Stayed low the whole time'}</h3>
        </div>
        <TableToggle open={table} onToggle={() => setTable((t) => !t)} />
      </div>}
      {table ? (
        <div className="table-wrap">
          <table className="metrics metrics--compact">
            <thead><tr><th className="left">Window</th><th>Starts at</th><th>Seizure probability</th></tr></thead>
            <tbody>{probs.map((p, i) => <tr key={i}><td className="left">{i + 1}</td><td className="num">{fmt(i * step)}</td><td className="num">{pct(p)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap">
          <svg
            ref={svgRef} className="chart" viewBox={`0 0 ${W} ${height}`} tabIndex={0} role="img"
            aria-label={`Seizure probability for ${probs.length} windows; ${events.length} sustained events. Use the arrow keys to read each window.`}
            onPointerMove={(e) => hover.setIndex(Math.max(0, Math.min(probs.length - 1, Math.floor((svgX(e, svgRef.current) - m.l) / slot))))}
            onPointerLeave={hover.onPointerLeave} onKeyDown={hover.onKeyDown} onBlur={hover.onBlur}
          >
            {events.map((e, k) => (
              <g key={k}>
                <rect x={xt(e.start_s)} y={m.t} width={Math.max(3, xt(e.end_s) - xt(e.start_s))} height={y(0) - m.t} fill="var(--status-critical)" opacity="0.16" />
                <text x={xt(e.start_s) + 3} y={m.t + 11} style={{ fill: 'var(--color-pure)' }}>{fmt(e.start_s)}</text>
              </g>
            ))}
            <g className="grid">{[0, 0.5, 1].map((v) => <line key={v} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />)}</g>
            {[0, 0.5, 1].map((v) => <text key={v} x={m.l - 8} y={y(v) + 3.5} textAnchor="end">{v * 100}%</text>)}
            <line x1={m.l} x2={W - m.r} y1={y(0.85)} y2={y(0.85)} stroke="var(--status-critical)" strokeWidth="1.2" strokeDasharray="6 4" opacity="0.85" />
            <text x={W - m.r} y={y(0.85) - 5} textAnchor="end">high confidence 85%</text>
            <line x1={m.l} x2={W - m.r} y1={y(0.5)} y2={y(0.5)} stroke="var(--color-fog)" strokeWidth="1" strokeDasharray="6 4" opacity="0.7" />
            <text x={W - m.r} y={y(0.5) - 5} textAnchor="end">threshold 50%</text>
            {long ? (
              <>
                <path d={area} fill={events.length ? 'var(--status-critical)' : 'var(--status-good)'} opacity="0.14" />
                <path d={probs.map((p, i) => `${i ? 'L' : 'M'}${xi(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')} fill="none" stroke={events.length ? 'var(--status-critical)' : 'var(--status-good)'} strokeWidth="2" strokeLinejoin="round" />
              </>
            ) : probs.map((p, i) => {
              const h = Math.max(2, y(0) - y(p))
              return (
                <path key={i} d={`M${xi(i)},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${bar - 8} q4,0 4,4 v${h - 4} z`}
                  fill={`var(--status-${tone(p)})`} opacity={active === null || active === i ? 1 : 0.55} />
              )
            })}
            {typeof eyesOpenAt === 'number' && eyesOpenAt < total && !long && (
              <g>
                <line x1={xt(eyesOpenAt)} x2={xt(eyesOpenAt)} y1={m.t} y2={y(0)} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                <text x={xt(eyesOpenAt) + 6} y={y(0.5) + 16}>eyes open →</text>
              </g>
            )}
            {active !== null && long && <line className="crosshair" x1={xi(active)} x2={xi(active)} y1={m.t} y2={y(0)} />}
            {[0, total / 2, total].map((t) => <text key={t} x={xt(t)} y={height - 8} textAnchor="middle">{fmt(t)}</text>)}
          </svg>
          {active !== null && (
            <Tooltip x={xi(active)} y={y(probs[active])} height={height} width={210}>
              <div className="chart-tip__head">Window {active + 1} · {fmt(active * step)}–{fmt(active * step + 4)}</div>
              <div className="chart-tip__row"><span className="key" style={{ '--key': `var(--status-${tone(probs[active])})` }} /><strong>{pct(probs[active])}</strong> <span className="muted">seizure probability</span></div>
            </Tooltip>
          )}
        </div>
      )}
      {!bare && <Explain>One high bar alone is usually noise. A seizure keeps bars high several in a row (shaded red).</Explain>}
    </Wrap>
  )
}

/* ------------------------------------------------------------------ raw waveform */

export function WaveViewer({ waveform }) {
  const [tab, setTab] = useState('eyes_closed')
  const [start, setStart] = useState(0)
  const svgRef = useRef(null)
  const data = waveform?.[tab] || []
  const fs = waveform?.fs || 50
  const span = 10
  const seconds = data.length / fs
  const from = Math.min(start, Math.max(0, seconds - span))
  const slice = data.slice(Math.round(from * fs), Math.round((from + span) * fs))
  const hover = useHover(slice.length)
  const limit = useMemo(() => {
    const all = [...(waveform?.eyes_closed || []), ...(waveform?.eyes_open || [])].map(Math.abs).sort((a, b) => a - b)
    const p99 = all[Math.floor(all.length * 0.99)] || 10
    return niceTicks(0, p99 * 1.1, 2).at(-1) || p99
  }, [waveform])
  if (!data.length) return null

  const height = 210
  const m = { l: 52, r: 16, t: 12, b: 30 }
  const x = (i) => m.l + (i / (span * fs)) * (W - m.l - m.r)
  const y = (v) => m.t + (1 - (Math.max(-limit, Math.min(limit, v)) + limit) / (2 * limit)) * (height - m.t - m.b)
  const path = slice.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const active = hover.index

  return (
    <section className="panel">
      <div className="viz-head">
        <div>
          <p className="panel__eyebrow">Your brainwaves</p>
          <h3 className="panel__title">The raw signal from your ear</h3>
        </div>
        <div className="choices no-print" role="tablist">
          {[['eyes_closed', 'Eyes closed'], ['eyes_open', 'Eyes open']].map(([k, label]) => (
            <label className="choice" key={k}>
              <input type="radio" name="wave-tab" checked={tab === k} onChange={() => { setTab(k); setStart(0) }} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="chart-wrap">
        <svg
          ref={svgRef} className="chart" viewBox={`0 0 ${W} ${height}`} tabIndex={0} role="img"
          aria-label={`${tab === 'eyes_closed' ? 'Eyes-closed' : 'Eyes-open'} EEG trace from ${from.toFixed(0)} to ${(from + span).toFixed(0)} seconds.`}
          onPointerMove={(e) => hover.setIndex(Math.max(0, Math.min(slice.length - 1, Math.round(((svgX(e, svgRef.current) - m.l) / (W - m.l - m.r)) * span * fs))))}
          onPointerLeave={hover.onPointerLeave} onKeyDown={hover.onKeyDown} onBlur={hover.onBlur}
        >
          <g className="grid">{[-limit, 0, limit].map((v) => <line key={v} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />)}</g>
          {[-limit, 0, limit].map((v) => <text key={v} x={m.l - 8} y={y(v) + 3.5} textAnchor="end">{v} µV</text>)}
          {[0, 2, 4, 6, 8, 10].map((s) => <text key={s} x={x(s * fs)} y={height - 8} textAnchor="middle">{(from + s).toFixed(0)} s</text>)}
          <path d={path} fill="none" stroke={tab === 'eyes_closed' ? 'var(--series-1)' : 'var(--series-2)'} strokeWidth="1.4" strokeLinejoin="round" />
          {active !== null && <line className="crosshair" x1={x(active)} x2={x(active)} y1={m.t} y2={height - m.b} />}
        </svg>
        {active !== null && (
          <Tooltip x={x(active)} y={y(slice[active])} height={height} width={170}>
            <div className="chart-tip__head">{(from + active / fs).toFixed(2)} s</div>
            <div className="chart-tip__row"><strong>{slice[active].toFixed(1)} µV</strong></div>
          </Tooltip>
        )}
      </div>
      {seconds > span && (
        <label className="field no-print" style={{ marginTop: 'var(--sp-12)' }}>
          <span className="field__label">Move through the recording ({seconds.toFixed(0)} s)</span>
          <input type="range" min={0} max={Math.max(0, Math.floor(seconds - span))} step={1} value={from} onChange={(e) => setStart(Number(e.target.value))} className="range" />
        </label>
      )}
      <Explain>Eyes closed: a smooth ~10 waves/second rhythm (alpha) should appear. Big spikes are blinks or jaw movement.</Explain>
    </section>
  )
}

/* ------------------------------------------------------------------ band powers */

const BAND_SHORT = { delta: 'slow / movement', theta: 'drowsy', alpha: 'relaxed', beta: 'alert / muscle' }

const BAND_INFO = [
  ['delta', 'Delta', '1–4 Hz', 'Slow waves: deep sleep, and also eye or body movement.'],
  ['theta', 'Theta', '4–8 Hz', 'Drowsiness, daydreaming and memory.'],
  ['alpha', 'Alpha', '8–13 Hz', 'Relaxed and awake, strongest with eyes closed.'],
  ['beta', 'Beta', '13–30 Hz', 'Alert thinking, and also muscle tension near the ear.'],
]

export function BandBars({ closed, open }) {
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState(null)
  if (!closed) return null
  const rowH = 46
  const height = BAND_INFO.length * rowH + 18
  const m = { l: 92, r: 54 }
  const x = (v) => (v || 0) * (W - m.l - m.r)
  return (
    <section className="panel">
      <div className="viz-head">
        <div>
          <p className="panel__eyebrow">Brainwave bands</p>
          <h3 className="panel__title">Which rhythms were strongest</h3>
        </div>
        <TableToggle open={table} onToggle={() => setTable((t) => !t)} />
      </div>
      <div className="legend">
        <span><span className="swatch" style={{ '--key': 'var(--series-1)', opacity: 1 }} /> Eyes closed</span>
        {open && <span><span className="swatch" style={{ '--key': 'var(--series-2)', opacity: 1 }} /> Eyes open</span>}
      </div>
      {table ? (
        <div className="table-wrap">
          <table className="metrics metrics--compact">
            <thead><tr><th className="left">Band</th><th>Eyes closed</th>{open && <th>Eyes open</th>}<th className="left">What it reflects</th></tr></thead>
            <tbody>{BAND_INFO.map(([k, name, range, about]) => (
              <tr key={k}><td className="left">{name} ({range})</td><td className="num">{pct(closed[k])}</td>{open && <td className="num">{pct(open[k])}</td>}<td className="left" style={{ whiteSpace: 'normal' }}>{about}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap">
          <svg className="chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Share of signal power in each brainwave band, eyes closed and eyes open.">
            {BAND_INFO.map(([k, name, range], i) => {
              const top = 8 + i * rowH
              const bars = [['closed', closed[k], 'var(--series-1)']]
              if (open) bars.push(['open', open[k], 'var(--series-2)'])
              return (
                <g key={k}>
                  <text x={0} y={top + 13} style={{ fill: 'var(--color-fog)' }}>{name}</text>
                  <text x={0} y={top + 27}>{BAND_SHORT[k]}</text>
                  {bars.map(([which, v, color], j) => (
                    <g key={which} onPointerEnter={() => setHover(`${k}-${which}`)} onPointerLeave={() => setHover(null)}>
                      <rect x={m.l} y={top + j * 16} width={Math.max(4, x(v))} height={14} rx={4} fill={color} opacity={hover && hover !== `${k}-${which}` ? 0.5 : 1} />
                      <text x={m.l + Math.max(4, x(v)) + 6} y={top + j * 16 + 11} style={{ fill: 'var(--color-fog)' }}>{pct(v)}</text>
                    </g>
                  ))}
                </g>
              )
            })}
          </svg>
        </div>
      )}

    </section>
  )
}

/* ------------------------------------------------------------------ spectrogram */

function rampColor(t) {
  const c = Math.max(0, Math.min(1, t)) * (RAMP.length - 1)
  const i = Math.min(RAMP.length - 2, Math.floor(c))
  const f = c - i
  const a = RAMP[i].match(/\w\w/g).map((h) => parseInt(h, 16))
  const b = RAMP[i + 1].match(/\w\w/g).map((h) => parseInt(h, 16))
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`
}

export function Spectrogram({ spectrogram, height = 240, bare = false }) {
  const svgRef = useRef(null)
  const [hover, setHover] = useState(null)
  const [table, setTable] = useState(false)
  const scale = useMemo(() => {
    if (!spectrogram) return null
    const all = spectrogram.power_db.flat().sort((a, b) => a - b)
    return { lo: all[Math.floor(all.length * 0.05)], hi: all[Math.floor(all.length * 0.95)] }
  }, [spectrogram])
  if (!spectrogram?.power_db?.length) return null
  const { times, freqs, power_db: grid, eyes_open_at: openAt } = spectrogram
  const m = { l: 44, r: 16, t: 12, b: 30 }
  const tMax = times.at(-1) + 1
  const cw = (W - m.l - m.r) / times.length
  const ch = (height - m.t - m.b) / freqs.length
  const xT = (t) => m.l + (t / tMax) * (W - m.l - m.r)
  const yF = (f) => m.t + (freqs.length - (f - freqs[0]) - 1) * ch
  const norm = (v) => (v - scale.lo) / (scale.hi - scale.lo || 1)
  const alphaRows = freqs.map((f, i) => [f, i]).filter(([f]) => f >= 8 && f < 13).map(([, i]) => i)
  const alphaByFive = []
  for (let s = 0; s < tMax; s += 5) {
    const cols = times.map((t, i) => [t, i]).filter(([t]) => t >= s && t < s + 5).map(([, i]) => i)
    if (cols.length) alphaByFive.push([s, cols.reduce((acc, c) => acc + alphaRows.reduce((a2, r) => a2 + grid[c][r], 0) / alphaRows.length, 0) / cols.length])
  }

  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const py = ((e.clientY - rect.top) / rect.height) * height
    const ci = Math.floor((px - m.l) / cw)
    const fi = freqs.length - 1 - Math.floor((py - m.t) / ch)
    if (ci >= 0 && ci < times.length && fi >= 0 && fi < freqs.length) setHover({ ci, fi })
    else setHover(null)
  }

  const Wrap = bare ? 'div' : 'section'
  return (
    <Wrap className={bare ? undefined : 'panel'}>
      {!bare && <div className="viz-head">
        <div>
          <p className="panel__eyebrow">Spectrogram</p>
          <h3 className="panel__title">Your rhythms over time</h3>
        </div>
        <TableToggle open={table} onToggle={() => setTable((t) => !t)} />
      </div>}
      {table ? (
        <div className="table-wrap">
          <table className="metrics metrics--compact">
            <thead><tr><th className="left">Time</th><th>Average alpha-band power (dB)</th><th className="left">Eyes</th></tr></thead>
            <tbody>{alphaByFive.map(([s, v]) => <tr key={s}><td className="left">{s}–{s + 5} s</td><td className="num">{v.toFixed(1)}</td><td className="left">{s < openAt ? 'closed' : 'open'}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div className="chart-wrap">
          <svg ref={svgRef} className="chart" viewBox={`0 0 ${W} ${height}`} role="img" onPointerMove={onMove} onPointerLeave={() => setHover(null)}
            aria-label="Spectrogram: frequency from 1 to 29 hertz over the recording, brighter means more power. Table view available.">
            {grid.map((col, ci) => col.map((v, fi) => (
              <rect key={`${ci}-${fi}`} x={m.l + ci * cw} y={yF(freqs[fi])} width={cw + 0.4} height={ch + 0.4} fill={rampColor(norm(v))} />
            )))}
            {[8, 13].map((f) => <line key={f} x1={m.l} x2={W - m.r} y1={yF(f) + (f === 13 ? ch : 0)} y2={yF(f) + (f === 13 ? ch : 0)} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />)}
            <text x={W - m.r - 4} y={yF(12) + 2} textAnchor="end" style={{ fill: 'var(--color-pure)' }}>alpha 8–13 Hz</text>
            {typeof openAt === 'number' && (
              <g>
                <line x1={xT(openAt)} x2={xT(openAt)} y1={m.t} y2={height - m.b} stroke="#fff" strokeWidth="1.5" />
                <text x={xT(openAt) - 6} y={m.t + 12} textAnchor="end" style={{ fill: 'var(--color-pure)' }}>eyes closed</text>
                <text x={xT(openAt) + 6} y={m.t + 12} style={{ fill: 'var(--color-pure)' }}>eyes open</text>
              </g>
            )}
            {[5, 10, 15, 20, 25].map((f) => <text key={f} x={m.l - 8} y={yF(f) + ch / 2 + 3.5} textAnchor="end">{f} Hz</text>)}
            {[0, Math.round(tMax / 4), Math.round(tMax / 2), Math.round((3 * tMax) / 4), Math.round(tMax)].map((t) => (
              <text key={t} x={xT(t)} y={height - 8} textAnchor="middle">{t} s</text>
            ))}
          </svg>
          {hover && (
            <Tooltip x={m.l + hover.ci * cw} y={yF(freqs[hover.fi])} height={height} width={180}>
              <div className="chart-tip__head">{times[hover.ci].toFixed(0)} s · {freqs[hover.fi]} Hz</div>
              <div className="chart-tip__row"><span className="key" style={{ '--key': rampColor(norm(grid[hover.ci][hover.fi])) }} /><strong>{grid[hover.ci][hover.fi].toFixed(1)} dB</strong></div>
            </Tooltip>
          )}
        </div>
      )}
      <div className="ramp-legend" aria-hidden="true">
        <span>less power</span>
        <span className="ramp-legend__bar" style={{ background: `linear-gradient(90deg, ${RAMP.join(',')})` }} />
        <span>more power</span>
      </div>
      {!bare && <Explain>Brighter = stronger rhythm. Alpha (between the lines) should glow with eyes closed and dim after they open.</Explain>}
    </Wrap>
  )
}

/* ------------------------------------------------------------------ key numbers + explanation */

export function brainSummary(features, quality) {
  const out = []
  if (!features) return out
  const closed = features.relative_power || {}
  if (quality?.grade === 'poor') out.push('Noisy recording: reseat the earbud and record again.')
  if (closed.alpha >= 0.25) out.push(`Clear relaxed rhythm (alpha) with eyes closed: ${pct(closed.alpha)}.`)
  else if (closed.alpha >= 0.1) out.push(`Some relaxed rhythm (alpha) with eyes closed: ${pct(closed.alpha)}.`)
  else out.push(`Weak relaxed rhythm (alpha ${pct(closed.alpha)}): usually jaw tension. Relax your jaw next time.`)
  if (closed.beta >= 0.4) out.push(`High fast activity (beta ${pct(closed.beta)}): mostly muscle noise near the ear.`)
  if (typeof features.alpha_reactivity === 'number') {
    out.push(features.alpha_reactivity >= 1.5
      ? `Alpha dropped ${features.alpha_reactivity.toFixed(1)}× when you opened your eyes: normal.`
      : `Alpha barely changed when you opened your eyes (${features.alpha_reactivity.toFixed(1)}×): likely noise.`)
  }
  if (typeof features.paf_hz === 'number') {
    out.push(features.paf_hz >= 8 && features.paf_hz <= 12
      ? `Rhythm speed ${features.paf_hz.toFixed(1)} Hz: typical (8–12).`
      : `Rhythm speed ${features.paf_hz.toFixed(1)} Hz: outside the usual 8–12.`)
  }
  return out
}

// Each number on a scale with the usual range shaded, plus a one-word reading.
const SCALES = [
  { key: 'paf_hz', label: 'Brain rhythm speed', sub: 'Peak alpha frequency', unit: 'Hz', min: 6, max: 14, lo: 8, hi: 12, digits: 1,
    words: ['Slower than usual', 'Typical', 'Faster than usual'],
    about: 'How fast your main resting rhythm runs. It can slow with some brain conditions, so we watch it over time.' },
  { key: 'alpha_reactivity', label: 'Eyes-open response', sub: 'Alpha reactivity', unit: '×', min: 0, max: 5, lo: 1.5, hi: 5, digits: 1,
    words: ['Weak', 'Typical', 'Strong'],
    about: 'How much the relaxed rhythm drops when you open your eyes. A clear drop is the healthy response.' },
  { key: 'theta_alpha_ratio', label: 'Slow-wave balance', sub: 'Theta / alpha ratio', unit: '', min: 0, max: 3, lo: 0, hi: 1, digits: 2,
    words: ['', 'Typical', 'More slow waves'],
    about: 'Slow theta compared with relaxed alpha. A rise over time can be an early sign of slowing; muscle noise also raises it.' },
]

function Scale({ s, value }) {
  const at = (v) => `${((Math.max(s.min, Math.min(s.max, v)) - s.min) / (s.max - s.min)) * 100}%`
  const zone = value < s.lo ? 0 : value > s.hi ? 2 : 1
  const tone = zone === 1 ? 'good' : 'warning'
  return (
    <div className="scale">
      <div className="scale__track">
        <span className="scale__band" style={{ left: at(s.lo), width: `calc(${at(s.hi)} - ${at(s.lo)})` }} />
        <span className={`scale__dot tone-${tone}`} style={{ left: at(value) }} />
      </div>
      <div className="scale__ends"><span>{s.min}</span><span>usual {s.lo}–{s.hi}{s.unit && ` ${s.unit}`}</span><span>{s.max}</span></div>
      <StatusChip status={zone === 1 ? 'ok' : 'watch'} label={s.words[zone]} />
    </div>
  )
}

export function KeyNumbers({ features }) {
  if (!features) return null
  return (
    <div className="grid-3">
      {SCALES.map((s) => {
        const value = features[s.key]
        return (
          <div className="tile" key={s.key}>
            <div className="tile__label">{s.label}</div>
            <div className="tile__value">{typeof value === 'number' ? value.toFixed(s.digits) : '—'}{s.unit && <span className="unit">{s.unit}</span>}</div>
            <div className="tile__sub">{s.sub}</div>
            {typeof value === 'number' && <Scale s={s} value={value} />}
          </div>
        )
      })}
    </div>
  )
}

export function QualityStrip({ quality, source }) {
  if (!quality) return null
  const grade = quality.grade
  return (
    <div className="quality-strip">
      <StatusChip status={grade === 'poor' ? 'watch' : 'ok'} label={`Signal ${grade}`} />
      {typeof quality.kept_pct === 'number' && <span className="mono muted">{quality.kept_pct}% of the recording usable</span>}
      {typeof quality.fs_measured === 'number' && <span className="mono muted">sampled at {quality.fs_measured} Hz{Math.abs(quality.fs_measured - 250) > 12.5 ? ', corrected to 250 Hz' : ''}</span>}
      {typeof quality.mains_hz === 'number' && <span className="mono muted">{quality.mains_hz} Hz mains noise removed</span>}
      {source === 'simulated' && <span className="sim-tag">SIMULATED SIGNAL</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ EEG during the games */

const GAME_NAME = { rest: 'Relax', reaction: 'Reaction time', pattern: 'Same or different', memory: 'Pattern memory' }

function readChange(c) {
  if (typeof c?.alpha_pct !== 'number') return { word: 'Not enough clean signal', tone: 'neutral' }
  if (c.alpha_pct <= -15) return { word: 'Focus mode on', tone: 'good' }
  if (c.alpha_pct < 5) return { word: 'Little change', tone: 'warning' }
  return { word: 'Relaxed rhythm rose', tone: 'warning' }
}

export function TaskEegPanel({ task, height = 220 }) {
  const svgRef = useRef(null)
  const r = task?.result
  const points = r?.timeline || []
  const hover = useHover(points.length)
  if (!r || !points.length) return null
  const m = { l: 44, r: 16, t: 26, b: 30 }
  const total = r.length_s || points.at(-1).t + 2
  const x = (t) => m.l + (t / total) * (W - m.l - m.r)
  const vals = points.flatMap((p) => [p.alpha, p.theta]).filter((v) => typeof v === 'number')
  const top = Math.min(1, Math.max(0.2, Math.ceil((Math.max(...vals, 0.1) * 1.15) * 10) / 10))
  const y = (v) => m.t + (1 - v / top) * (height - m.t - m.b)
  const line = (key) => points.map((p, i) => (typeof p[key] === 'number' ? `${i && typeof points[i - 1][key] === 'number' ? 'L' : 'M'}${x(p.t + 1).toFixed(1)},${y(p[key]).toFixed(1)}` : '')).join(' ')
  const blocks = Object.entries(r.blocks || {})
  const active = hover.index

  return (
    <section className="panel">
      <div className="viz-head">
        <div>
          <p className="panel__eyebrow">Your brain during the games</p>
          <h3 className="panel__title">Did your brain switch into focus?</h3>
        </div>
      </div>
      <QualityStrip quality={r.quality} source={task.mode === 'simulated' ? 'simulated' : r.source} />
      <div className="legend">
        <span><span className="key" style={{ '--key': 'var(--series-1)' }} /> Alpha (relaxed)</span>
        <span><span className="key" style={{ '--key': 'var(--series-2)' }} /> Theta (working memory)</span>
      </div>
      <div className="chart-wrap">
        <svg
          ref={svgRef} className="chart" viewBox={`0 0 ${W} ${height}`} tabIndex={0} role="img"
          aria-label="Share of alpha and theta rhythm over the games, with each game shaded."
          onPointerMove={(e) => hover.setIndex(Math.max(0, Math.min(points.length - 1, Math.round(((svgX(e, svgRef.current) - m.l) / (W - m.l - m.r)) * total / 2))))}
          onPointerLeave={hover.onPointerLeave} onKeyDown={hover.onKeyDown} onBlur={hover.onBlur}
        >
          {blocks.map(([label, b]) => (
            <g key={label}>
              <rect x={x(b.start_s)} y={m.t} width={Math.max(2, x(b.end_s) - x(b.start_s))} height={y(0) - m.t}
                fill={label === 'rest' ? 'rgba(255,255,255,0.05)' : 'rgba(217,150,63,0.10)'} />
              <text x={x(b.start_s) + 4} y={m.t - 8} style={{ fill: 'var(--color-fog)' }}>{GAME_NAME[label]}</text>
            </g>
          ))}
          <g className="grid">{[0, top / 2, top].map((v) => <line key={v} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />)}</g>
          {[0, top / 2, top].map((v) => <text key={v} x={m.l - 8} y={y(v) + 3.5} textAnchor="end">{Math.round(v * 100)}%</text>)}
          <path d={line('alpha')} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
          <path d={line('theta')} fill="none" stroke="var(--series-2)" strokeWidth="2" strokeLinejoin="round" />
          {active !== null && <line className="crosshair" x1={x(points[active].t + 1)} x2={x(points[active].t + 1)} y1={m.t} y2={y(0)} />}
          {[0, total / 2, total].map((t) => <text key={t} x={x(t)} y={height - 8} textAnchor="middle">{mmss(t)}</text>)}
        </svg>
        {active !== null && (
          <Tooltip x={x(points[active].t + 1)} y={m.t + 20} height={height} width={190}>
            <div className="chart-tip__head">{mmss(points[active].t)}</div>
            {points[active].alpha === null
              ? <div className="chart-tip__row muted">Noisy moment, not used</div>
              : <>
                  <div className="chart-tip__row"><span className="key" style={{ '--key': 'var(--series-1)' }} /><strong>{pct(points[active].alpha)}</strong> <span className="muted">alpha</span></div>
                  <div className="chart-tip__row"><span className="key" style={{ '--key': 'var(--series-2)' }} /><strong>{pct(points[active].theta)}</strong> <span className="muted">theta</span></div>
                </>}
          </Tooltip>
        )}
      </div>
      <div className="grid-3" style={{ marginTop: 'var(--sp-16)' }}>
        {['reaction', 'pattern', 'memory'].filter((g) => r.blocks?.[g]).map((g) => {
          const c = r.changes?.[g]
          const read = readChange(c)
          const signed = (v) => (typeof v === 'number' ? `${v > 0 ? '+' : ''}${Math.round(v)}%` : '—')
          return (
            <div className="tile" key={g}>
              <div className="tile__label">{GAME_NAME[g]}</div>
              <div className="row" style={{ marginTop: 8 }}><StatusChip status={read.tone === 'good' ? 'ok' : read.tone === 'neutral' ? 'baseline' : 'watch'} label={read.word} /></div>
              <p className="tile__about">Alpha <strong>{signed(c?.alpha_pct)}</strong> · Theta <strong>{signed(c?.theta_pct)}</strong> vs relaxed</p>
            </div>
          )
        })}
      </div>
      <Explain>When you concentrate, the relaxed rhythm (alpha) usually drops and theta rises. Each game is compared with your 20-second relaxed baseline.</Explain>
    </section>
  )
}
