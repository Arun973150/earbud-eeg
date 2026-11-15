import { useMemo, useRef } from 'react'
import { useHover, svgX, Tooltip, niceTicks, SpectrumChart } from './Charts.jsx'
import { Spectrogram, SeizureTimeline, mmss } from './EegViz.jsx'
import { Link } from '../router.jsx'

const W = 640

/* ------------------------------------------------------------------ the one answer */

export const VERDICT = {
  normal: {
    word: 'Normal', icon: '✓', tone: 'good',
    action: 'Nothing to act on. Check again in a few months, or sooner if something changes.',
  },
  abnormal: {
    word: 'Abnormal', icon: '!', tone: 'critical',
    action: 'Show this report to a doctor. This is a screen, not a diagnosis.',
  },
  unclear: {
    word: 'Unclear', icon: '?', tone: 'neutral',
    action: 'Reseat the earbud, relax your jaw and record again.',
  },
}

export function VerdictHero({ verdict }) {
  const v = VERDICT[verdict?.status] || VERDICT.unclear
  return (
    <div className={`answer answer--${verdict?.status || 'unclear'}`}>
      <span className="answer__icon" aria-hidden="true">{v.icon}</span>
      <div className="answer__body">
        <p className="answer__label">Your brain today</p>
        <p className="answer__word">{v.word}</p>
        <ul className="answer__reasons">
          {(verdict?.reasons || []).map((r) => <li key={r.key}>{r.text}</li>)}
        </ul>
        <p className="answer__action">{v.action}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ four tiles */

function Tile({ icon, label, word, detail, tone }) {
  return (
    <div className={`btile tone-${tone}`}>
      <span className="btile__icon" aria-hidden="true">{icon}</span>
      <div>
        <div className="btile__label">{label}</div>
        <div className="btile__word">{word}</div>
        {detail && <div className="btile__detail">{detail}</div>}
      </div>
    </div>
  )
}

export function ResultTiles({ result }) {
  const f = result?.features || {}
  const q = result?.quality || {}
  const screen = result?.seizure_screen
  const events = screen?.events?.length || 0
  const num = (x) => typeof x === 'number' && Number.isFinite(x)
  return (
    <div className="btiles">
      <Tile
        icon={!screen ? '–' : events ? '!' : '✓'} label="Seizure"
        word={!screen ? 'Not checked' : events ? 'Detected' : 'None'}
        detail={!screen ? 'signal too noisy' : events ? `${events} event${events === 1 ? '' : 's'}` : `${screen.windows} windows checked`}
        tone={!screen ? 'neutral' : events ? 'critical' : 'good'}
      />
      <Tile
        icon="∿" label="Brain rhythm"
        word={!num(f.paf_hz) ? '—' : f.paf_hz < 8 ? 'Slow' : f.paf_hz > 12 ? 'Fast' : 'Typical'}
        detail={num(f.paf_hz) ? `${f.paf_hz.toFixed(1)} Hz · usual 8–12` : 'not measured'}
        tone={!num(f.paf_hz) ? 'neutral' : f.paf_hz < 8 ? 'critical' : f.paf_hz > 12 ? 'warning' : 'good'}
      />
      <Tile
        icon="◉" label="Eyes-open response"
        word={!num(f.alpha_reactivity) ? '—' : f.alpha_reactivity >= 1.5 ? 'Normal' : 'Weak'}
        detail={num(f.alpha_reactivity) ? `alpha dropped ${f.alpha_reactivity.toFixed(1)}×` : 'not measured'}
        tone={!num(f.alpha_reactivity) ? 'neutral' : f.alpha_reactivity >= 1.5 ? 'good' : 'warning'}
      />
      <Tile
        icon="▮" label="Signal"
        word={q.grade ? q.grade[0].toUpperCase() + q.grade.slice(1) : '—'}
        detail={num(q.kept_pct) ? `${q.kept_pct}% usable` : null}
        tone={q.grade === 'good' ? 'good' : q.grade === 'fair' ? 'warning' : 'critical'}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ the whole recording */

// Min/max envelope of the full recording, so two minutes fit in one line.
function SignalOverview({ waveform, height = 200 }) {
  const svgRef = useRef(null)
  const closed = waveform?.eyes_closed || []
  const open = waveform?.eyes_open || []
  const fs = waveform?.fs || 50
  const all = useMemo(() => [...closed, ...open], [closed, open])
  const m = { l: 52, r: 16, t: 12, b: 30 }
  const cols = Math.min(all.length, (W - m.l - m.r) * 2)
  const per = all.length / Math.max(1, cols)
  const env = useMemo(() => {
    const out = []
    for (let c = 0; c < cols; c++) {
      const seg = all.slice(Math.floor(c * per), Math.max(Math.floor(c * per) + 1, Math.floor((c + 1) * per)))
      out.push([Math.min(...seg), Math.max(...seg)])
    }
    return out
  }, [all, cols, per])
  const limit = useMemo(() => {
    const sorted = all.map(Math.abs).sort((a, b) => a - b)
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 10
    return niceTicks(0, p99 * 1.1, 2).at(-1) || p99
  }, [all])
  const hover = useHover(cols)
  if (!all.length) return null

  const seconds = all.length / fs
  const openAt = closed.length / fs
  const x = (c) => m.l + (c / cols) * (W - m.l - m.r)
  const xt = (t) => m.l + (t / seconds) * (W - m.l - m.r)
  const y = (v) => m.t + (1 - (Math.max(-limit, Math.min(limit, v)) + limit) / (2 * limit)) * (height - m.t - m.b)
  const split = Math.round((closed.length / all.length) * cols)
  const band = (from, to) =>
    env.slice(from, to).map(([lo, hi], i) => `M${x(from + i).toFixed(1)},${y(hi).toFixed(1)}V${y(lo).toFixed(1)}`).join('')
  const ticks = niceTicks(0, seconds, 5).filter((t) => t <= seconds)
  const active = hover.index

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef} className="chart" viewBox={`0 0 ${W} ${height}`} tabIndex={0} role="img"
        aria-label={`EEG signal for the whole ${Math.round(seconds)} second recording, in microvolts. Eyes closed first, then eyes open at ${Math.round(openAt)} seconds.`}
        onPointerMove={(e) => hover.setIndex(Math.max(0, Math.min(cols - 1, Math.round(((svgX(e, svgRef.current) - m.l) / (W - m.l - m.r)) * cols))))}
        onPointerLeave={hover.onPointerLeave} onKeyDown={hover.onKeyDown} onBlur={hover.onBlur}
      >
        <g className="grid">{[-limit, 0, limit].map((v) => <line key={v} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />)}</g>
        {[-limit, 0, limit].map((v) => <text key={v} x={m.l - 8} y={y(v) + 3.5} textAnchor="end">{v} µV</text>)}
        <path d={band(0, split)} stroke="var(--series-1)" strokeWidth="1" fill="none" />
        <path d={band(split, cols)} stroke="var(--series-2)" strokeWidth="1" fill="none" />
        {open.length > 0 && (
          <g>
            <line x1={xt(openAt)} x2={xt(openAt)} y1={m.t} y2={height - m.b} stroke="#fff" strokeWidth="1.5" />
            <text x={xt(openAt) - 6} y={m.t + 10} textAnchor="end" style={{ fill: 'var(--color-pure)' }}>eyes closed</text>
            <text x={xt(openAt) + 6} y={m.t + 10} style={{ fill: 'var(--color-pure)' }}>eyes open</text>
          </g>
        )}
        {ticks.map((t) => <text key={t} x={xt(t)} y={height - 8} textAnchor="middle">{seconds > 120 ? mmss(t) : `${t} s`}</text>)}
        {active !== null && <line className="crosshair" x1={x(active)} x2={x(active)} y1={m.t} y2={height - m.b} />}
      </svg>
      {active !== null && env[active] && (
        <Tooltip x={x(active)} y={y(env[active][1])} height={height} width={180}>
          <div className="chart-tip__head">{((active / cols) * seconds).toFixed(1)} s · eyes {active < split ? 'closed' : 'open'}</div>
          <div className="chart-tip__row"><strong>{env[active][0].toFixed(0)} to {env[active][1].toFixed(0)} µV</strong></div>
        </Tooltip>
      )}
    </div>
  )
}

function FigPanel({ n, title, caption, children }) {
  return (
    <figure className="fig-panel">
      <figcaption className="fig-panel__head">
        <span className="fig-panel__n">{n}</span>
        <span className="fig-panel__title">{title}</span>
      </figcaption>
      {children}
      {caption && <p className="fig-panel__caption">{caption}</p>}
    </figure>
  )
}

// The four plots EEG people expect: signal, power spectrum, spectrogram, seizure probability.
export function EegFigure({ result }) {
  const f = result?.features || {}
  const eyesOpenAt = result?.protocol?.eyes_closed_s ?? result?.spectrogram?.eyes_open_at
  return (
    <section className="panel eeg-figure">
      <p className="panel__eyebrow">Your EEG</p>
      <h2 className="panel__title">What the earbud recorded</h2>
      <div className="eeg-figure__stack">
        <FigPanel n="1" title="EEG signal" caption="Your brainwaves in microvolts (µV). Tall spikes are blinks or jaw movement.">
          <SignalOverview waveform={result.waveform} />
        </FigPanel>
        {result.spectra && (
          <FigPanel n="2" title="Power spectrum" caption="Which rhythms were strongest. A bump in the alpha band with eyes closed is healthy.">
            <SpectrumChart spectra={result.spectra} paf={f.paf_hz} height={240} bands />
          </FigPanel>
        )}
        {result.spectrogram && (
          <FigPanel n="3" title="Spectrogram" caption="Rhythms over time. Brighter is stronger. Alpha should dim when your eyes open.">
            <Spectrogram spectrogram={result.spectrogram} bare />
          </FigPanel>
        )}
        {result.seizure_screen?.window_probabilities?.length > 0 && (
          <FigPanel n="4" title="Seizure probability (CNN-GRU)" caption="One point every 2 s. A seizure keeps it above the 85% line for 8 s or more (shaded red).">
            <SeizureTimeline screen={result.seizure_screen} eyesOpenAt={eyesOpenAt} bare lineMode />
          </FigPanel>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ history */

export function VerdictDots({ items }) {
  if (!items?.length) return null
  return (
    <div className="vdots" role="list" aria-label="Past results">
      {items.map((it) => (
        <Link key={it.id} role="listitem" className={`vdot vdot--${it.verdict || 'unclear'}`} to={`/app/s/${it.id}`}
          title={`${new Date(it.completedAt).toLocaleDateString()}: ${VERDICT[it.verdict]?.word || 'Unclear'}`}>
          <span className="vdot__icon" aria-hidden="true">{VERDICT[it.verdict]?.icon || '?'}</span>
          <span className="vdot__date">{new Date(it.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
        </Link>
      ))}
    </div>
  )
}
