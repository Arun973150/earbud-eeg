import { StatusChip, RangeBar } from './ui.jsx'
import { DOMAIN, METRIC, formatValue } from '../copy.js'

const SEVERITY = { decline: 0, watch: 1, pending: 2, ok: 3, improved: 3, baseline: 4, excluded: 5 }

export function DomainCard({ domain, evaluation, limit = 3 }) {
  const def = DOMAIN[domain]
  const status = evaluation?.domains?.[domain]
  const metrics = def.metrics
    .filter((id) => evaluation?.metrics?.[id])
    .sort((a, b) => (SEVERITY[evaluation.metrics[a].status] ?? 9) - (SEVERITY[evaluation.metrics[b].status] ?? 9))
  return (
    <article className="dcard">
      <div className="dcard__head">
        <h3 className="dcard__title">{def.label}</h3>
        {status && <StatusChip status={status} />}
      </div>
      {metrics.length === 0 && <p className="dcard__note muted">Not measured.</p>}
      {metrics.slice(0, limit).map((id) => {
        const m = evaluation.metrics[id]
        return (
          <div className="mline" key={id}>
            <span className="mline__label">{METRIC[id].label}</span>
            <span className="mline__value">{formatValue(id, m.value)}<span className="unit">{METRIC[id].unit}</span></span>
            <RangeBar id={id} value={m.value} low={m.low} high={m.high} status={m.status} />
            {m.status === 'baseline' && <span className="field__hint mline__range">Part of your baseline</span>}
            {m.status === 'excluded' && <span className="field__hint mline__range">Not used: the EEG signal was too noisy</span>}
          </div>
        )
      })}
    </article>
  )
}

export function WellbeingCard({ evaluation }) {
  const f = evaluation?.flags || {}
  const rows = [
    ['Mood (PHQ-2)', f.phq2, 6],
    ['Worry (GAD-2)', f.gad2, 6],
    ['Everyday tasks', f.function_score, 16],
  ].filter(([, v]) => typeof v === 'number')
  return (
    <article className="dcard">
      <div className="dcard__head">
        <h3 className="dcard__title">Mood & daily life</h3>
      </div>
      {rows.length === 0 && <p className="dcard__note muted">Not answered.</p>}
      {rows.map(([label, value, max]) => (
        <div className="mline" key={label}>
          <span className="mline__label">{label}</span>
          <span className="mline__value">{value}<span className="unit">/ {max}</span></span>
        </div>
      ))}
      {rows.length > 0 && <p className="dcard__note muted">Higher means more difficulty. 3 or more on mood or worry is worth talking about.</p>}
    </article>
  )
}
