import { useState } from 'react'
import { AppShell, PageHead, Loading, ErrorBox, SimTag, Notice } from '../components/ui.jsx'
import { TrendChart, TrendKey, TrendTable } from '../components/Charts.jsx'
import { useApi } from '../api.js'
import { DOMAIN, METRIC } from '../copy.js'

function MetricTrend({ id, series }) {
  const [table, setTable] = useState(false)
  const points = series.points.filter((pt) => pt.status !== 'pending')
  const hidden = series.points.length - points.length
  const def = METRIC[id]
  return (
    <section className="panel">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 'var(--sp-12)', alignItems: 'start' }}>
        <div>
          <h3 className="panel__title" style={{ marginBottom: 4 }}>{def.label}</h3>
          <p className="field__hint">{def.about} {def.better === 'lower' ? '↓ Lower is better.' : '↑ Higher is better.'}</p>
        </div>
        <button type="button" className="pill pill--quiet" onClick={() => setTable((t) => !t)} aria-pressed={table}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <div style={{ marginTop: 'var(--sp-16)' }}>
        {points.length === 0 ? <p className="panel__text muted">No results to show yet.</p>
          : table ? <TrendTable id={id} points={points} />
          : <TrendChart id={id} points={points} band={series.band} />}
      </div>
      {hidden > 0 && <p className="field__hint" style={{ marginTop: 'var(--sp-8)' }}>{hidden} recent result is with a clinician and will appear after review.</p>}
      {!series.band && <p className="field__hint" style={{ marginTop: 'var(--sp-8)' }}>Your usual range appears after three checks.</p>}
    </section>
  )
}

export default function Trends({ pid }) {
  const { data, error, loading } = useApi(`/api/participants/${pid}/trends`)
  if (loading) return <AppShell><Loading /></AppShell>
  if (error) return <AppShell><ErrorBox error={error} /></AppShell>
  const p = data.participant
  const domains = Object.entries(DOMAIN).filter(([, d]) => d.metrics.some((id) => data.metrics[id]))

  return (
    <AppShell>
      <PageHead
        back={{ to: `/app/p/${pid}`, label: p.nickname || p.code }}
        kicker={<>Trends · {p.code} {p.simulated && <SimTag />}</>}
        title="You compared with you"
        lead="Each line is one measure across your checks. The shaded band is your usual range, learned from your first three checks. Points outside it are what we watch."
      />
      <div style={{ marginBottom: 'var(--sp-24)' }}><TrendKey /></div>
      {domains.length === 0 && <Notice title="Nothing yet.">Complete a check to start your trends.</Notice>}
      <div className="stack stack--lg">
        {domains.map(([key, d]) => (
          <div key={key}>
            <p className="kicker">{d.label}</p>
            <div className="grid-2">
              {d.metrics.filter((id) => data.metrics[id]).map((id) => <MetricTrend key={id} id={id} series={data.metrics[id]} />)}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  )
}
