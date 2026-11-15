import { useRef, useState } from 'react'
import { METRIC, STATUS, formatValue, fmtDate } from '../copy.js'

const W = 640
const SURFACE = '#0b0b0b'

export function niceTicks(min, max, count = 4) {
  const span = max - min || 1
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw
  const ticks = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)))
  return ticks
}

// Shared hover logic: pointer or arrow keys pick the nearest index.
export function useHover(count) {
  const [index, setIndex] = useState(null)
  const onKeyDown = (e) => {
    if (!count) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      setIndex((i) => {
        const start = i ?? (e.key === 'ArrowRight' ? -1 : count)
        return Math.max(0, Math.min(count - 1, start + (e.key === 'ArrowRight' ? 1 : -1)))
      })
    } else if (e.key === 'Escape') setIndex(null)
  }
  return { index, setIndex, onKeyDown, onBlur: () => setIndex(null), onPointerLeave: () => setIndex(null) }
}

export function svgX(e, svg) {
  const rect = svg.getBoundingClientRect()
  return ((e.clientX - rect.left) / rect.width) * W
}

export function Tooltip({ x, y, width, height, children }) {
  // Keep the tooltip inside the chart: flip to the left of the crosshair near the right edge.
  const left = (x / W) * 100
  const flip = left > 62
  return (
    <div
      className="chart-tip"
      style={{ left: `${left}%`, top: `${(y / height) * 100}%`, transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`, maxWidth: width }}
    >
      {children}
    </div>
  )
}

const POINT_TONE = { watch: 'warning', decline: 'critical' }

export function TrendChart({ id, points, band: rawBand, height = 230 }) {
  const band = rawBand ? { ...rawBand, low: Math.max(0, rawBand.low) } : null
  const svgRef = useRef(null)
  const hover = useHover(points.length)
  const m = { l: 52, r: 18, t: 18, b: 30 }
  const times = points.map((p) => Date.parse(p.at))
  let t0 = Math.min(...times)
  let t1 = Math.max(...times)
  if (t1 - t0 < 30 * 86400000) {
    t0 -= 15 * 86400000
    t1 += 15 * 86400000
  }
  const values = points.map((p) => p.value).concat(band ? [band.low, band.high] : [])
  const vMin = Math.min(...values)
  const vMax = Math.max(...values)
  const padV = (vMax - vMin) * 0.12 || Math.abs(vMax) * 0.1 || 1
  const ticks = niceTicks(vMin - padV, vMax + padV, 4)
  const y0 = Math.min(ticks[0], vMin - padV)
  const y1 = Math.max(ticks[ticks.length - 1], vMax + padV)
  const x = (t) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r)
  const y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (height - m.t - m.b)

  const months = []
  const start = new Date(t0)
  for (let d = new Date(start.getFullYear(), start.getMonth() + 1, 1); d.getTime() <= t1; d.setMonth(d.getMonth() + 1)) months.push(d.getTime())
  const every = Math.max(1, Math.ceil(months.length / 6))
  const xTicks = months.filter((_, i) => i % every === 0)

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(times[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const active = hover.index !== null ? points[hover.index] : null
  const unit = METRIC[id]?.unit || ''

  const onPointerMove = (e) => {
    const px = svgX(e, svgRef.current)
    let best = 0
    times.forEach((t, i) => {
      if (Math.abs(x(t) - px) < Math.abs(x(times[best]) - px)) best = i
    })
    hover.setIndex(best)
  }

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        className="chart"
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={`${METRIC[id]?.label} over time, ${points.length} checks. Use the arrow keys to read each check.`}
        tabIndex={0}
        onPointerMove={onPointerMove}
        onPointerLeave={hover.onPointerLeave}
        onKeyDown={hover.onKeyDown}
        onBlur={hover.onBlur}
      >
        <g className="grid">
          {ticks.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />)}
        </g>
        {ticks.map((t) => <text key={t} x={m.l - 8} y={y(t) + 3.5} textAnchor="end">{formatValue(id, t)}</text>)}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={height - 8} textAnchor="middle">
            {new Date(t).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
          </text>
        ))}
        <line className="axis-line" x1={m.l} x2={W - m.r} y1={height - m.b} y2={height - m.b} />

        {band && (
          <g>
            <rect x={m.l} width={W - m.l - m.r} y={y(band.high)} height={Math.max(1, y(band.low) - y(band.high))} fill="rgba(255,255,255,0.1)" />
            <line x1={m.l} x2={W - m.r} y1={y(band.baseline)} y2={y(band.baseline)} stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            <text x={W - m.r - 6} y={y(band.high) + 13} textAnchor="end">your usual range</text>
          </g>
        )}

        <path d={path} fill="none" stroke="var(--color-fog)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {active && <line className="crosshair" x1={x(times[hover.index])} x2={x(times[hover.index])} y1={m.t} y2={height - m.b} />}
        {points.map((p, i) => {
          const tone = POINT_TONE[p.status]
          return (
            <circle
              key={p.sessionId}
              cx={x(times[i])}
              cy={y(p.value)}
              r={hover.index === i ? 6 : 4.5}
              fill={p.confounded ? SURFACE : tone ? `var(--status-${tone})` : 'var(--color-pure)'}
              stroke={p.confounded ? 'var(--color-fog)' : SURFACE}
              strokeWidth="2"
            />
          )
        })}
      </svg>
      {active && (
        <Tooltip x={x(times[hover.index])} y={y(active.value)} height={height} width={240}>
          <div className="chart-tip__head">{fmtDate(active.at)}</div>
          <div className="chart-tip__row">
            <span className="key" style={{ '--key': 'var(--color-fog)' }} />
            <strong>{formatValue(id, active.value)} {unit}</strong>
          </div>
          {active.status && <div className="chart-tip__row muted">{STATUS[active.status]?.label || active.status}</div>}
          {active.confounded && <div className="chart-tip__row muted">Taken while fasting, unwell or short on sleep</div>}
        </Tooltip>
      )}
    </div>
  )
}

export function TrendKey() {
  const dot = (fill, stroke = SURFACE) => (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill={fill} stroke={stroke} strokeWidth="2" /></svg>
  )
  return (
    <div className="legend" aria-label="Chart key">
      <span>{dot('var(--color-pure)')} Within or near usual range</span>
      <span>{dot('var(--status-warning)')} Slightly off</span>
      <span>{dot('var(--status-critical)')} Below usual</span>
      <span>{dot(SURFACE, 'var(--color-fog)')} Fasting, unwell or short sleep</span>
      <span><span className="swatch" style={{ '--key': '#fff' }} /> Your usual range</span>
    </div>
  )
}

// Shaded frequency bands, like the classic EEG power-spectrum figure. Alternating
// neutral tints keep them apart; alpha (the one that matters most) wears the series colour.
const SPECTRUM_BANDS = [
  { name: 'delta', lo: 1, hi: 4 }, { name: 'theta', lo: 4, hi: 8 }, { name: 'alpha', lo: 8, hi: 13, key: true },
  { name: 'beta', lo: 13, hi: 30 }, { name: 'gamma', lo: 30, hi: 45 },
]

export function SpectrumChart({ spectra, paf, height = 260, bands = false }) {
  const svgRef = useRef(null)
  const { freqs, eyes_closed: ec, eyes_open: eo } = spectra
  const hover = useHover(freqs.length)
  const m = { l: 52, r: 18, t: 22, b: 30 }
  const positive = [...ec, ...eo].filter((v) => v > 0)
  const lo = Math.floor(Math.log10(Math.min(...positive)))
  const hi = Math.ceil(Math.log10(Math.max(...positive)))
  const fMin = freqs[0]
  const fMax = freqs[freqs.length - 1]
  const x = (f) => m.l + ((f - fMin) / (fMax - fMin)) * (W - m.l - m.r)
  const y = (v) => m.t + (1 - (Math.log10(Math.max(v, 10 ** lo)) - lo) / (hi - lo || 1)) * (height - m.t - m.b)
  const line = (series) => series.map((v, i) => `${i ? 'L' : 'M'}${x(freqs[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const decades = []
  for (let d = lo; d <= hi; d++) decades.push(d)
  const pafIndex = typeof paf === 'number' ? freqs.reduce((b, f, i) => (Math.abs(f - paf) < Math.abs(freqs[b] - paf) ? i : b), 0) : null
  const active = hover.index

  const onPointerMove = (e) => {
    const px = svgX(e, svgRef.current)
    const f = fMin + ((px - m.l) / (W - m.l - m.r)) * (fMax - fMin)
    hover.setIndex(freqs.reduce((b, v, i) => (Math.abs(v - f) < Math.abs(freqs[b] - f) ? i : b), 0))
  }
  const fmt = (v) => (v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toPrecision(2))

  return (
    <div>
      <div className="legend">
        <span><span className="key" style={{ '--key': 'var(--series-1)' }} /> Eyes closed</span>
        <span><span className="key" style={{ '--key': 'var(--series-2)' }} /> Eyes open</span>
        {!bands && <span><span className="swatch" style={{ '--key': 'var(--series-1)' }} /> Alpha band (8–13 Hz)</span>}
      </div>
      <div className="chart-wrap">
        <svg
          ref={svgRef}
          className="chart"
          viewBox={`0 0 ${W} ${height}`}
          role="img"
          aria-label={`Power spectrum, eyes closed versus eyes open.${typeof paf === 'number' ? ` Peak alpha frequency ${paf.toFixed(1)} hertz.` : ''} Use the arrow keys to read values.`}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerLeave={hover.onPointerLeave}
          onKeyDown={hover.onKeyDown}
          onBlur={hover.onBlur}
        >
          {bands
            ? SPECTRUM_BANDS.filter((b) => b.lo < fMax).map((b, i) => {
                const x1 = x(Math.max(b.lo, fMin))
                const x2 = x(Math.min(b.hi, fMax))
                return (
                  <g key={b.name}>
                    <rect x={x1 + 1} y={m.t} width={Math.max(0, x2 - x1 - 2)} height={height - m.t - m.b}
                      fill={b.key ? 'var(--series-1)' : '#ffffff'} opacity={b.key ? 0.16 : i % 2 ? 0.07 : 0.035} />
                    <text x={(x1 + x2) / 2} y={height - m.b - 6} textAnchor="middle" style={{ fill: b.key ? 'var(--color-pure)' : 'var(--color-fog)' }}>{b.name}</text>
                  </g>
                )
              })
            : <rect x={x(8)} y={m.t} width={x(13) - x(8)} height={height - m.t - m.b} fill="var(--series-1)" opacity="0.1" />}
          <g className="grid">
            {decades.map((d) => <line key={d} x1={m.l} x2={W - m.r} y1={y(10 ** d)} y2={y(10 ** d)} />)}
          </g>
          {decades.map((d) => <text key={d} x={m.l - 8} y={y(10 ** d) + 3.5} textAnchor="end">{fmt(10 ** d)}</text>)}
          {(fMax > 32 ? [1, 10, 20, 30, 40] : [1, 5, 10, 15, 20, 25, 30]).filter((f) => f >= fMin && f <= fMax).map((f) => (
            <text key={f} x={x(f)} y={height - 8} textAnchor="middle">{f} Hz</text>
          ))}
          <line className="axis-line" x1={m.l} x2={W - m.r} y1={height - m.b} y2={height - m.b} />

          <path d={line(eo)} fill="none" stroke="var(--series-2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <path d={line(ec)} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {pafIndex !== null && (
            <g>
              <line x1={x(paf)} x2={x(paf)} y1={y(ec[pafIndex])} y2={height - m.b} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
              <circle cx={x(paf)} cy={y(ec[pafIndex])} r="4.5" fill="var(--series-1)" stroke={SURFACE} strokeWidth="2" />
              <text x={x(paf) + 8} y={y(ec[pafIndex]) - 8} style={{ fill: 'var(--color-fog)' }}>Peak alpha {paf.toFixed(1)} Hz</text>
            </g>
          )}
          {active !== null && <line className="crosshair" x1={x(freqs[active])} x2={x(freqs[active])} y1={m.t} y2={height - m.b} />}
        </svg>
        {active !== null && (
          <Tooltip x={x(freqs[active])} y={y(Math.max(ec[active], eo[active]))} height={height} width={220}>
            <div className="chart-tip__head">{freqs[active].toFixed(2)} Hz</div>
            <div className="chart-tip__row"><span className="key" style={{ '--key': 'var(--series-1)' }} /><strong>{fmt(ec[active])}</strong> <span className="muted">eyes closed</span></div>
            <div className="chart-tip__row"><span className="key" style={{ '--key': 'var(--series-2)' }} /><strong>{fmt(eo[active])}</strong> <span className="muted">eyes open</span></div>
            <div className="chart-tip__row muted">power, µV²/Hz</div>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

export function TrendTable({ id, points }) {
  return (
    <div className="table-wrap">
      <table className="metrics metrics--compact">
        <thead>
          <tr><th className="left">Date</th><th>{METRIC[id]?.label}</th><th className="left">Status</th></tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.sessionId}>
              <td className="left">{fmtDate(p.at)}</td>
              <td className="num">{formatValue(id, p.value)} {METRIC[id]?.unit}</td>
              <td className="left">{STATUS[p.status]?.label || '—'}{p.confounded ? ' · confounded' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
