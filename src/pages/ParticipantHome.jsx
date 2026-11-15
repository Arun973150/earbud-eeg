import ParticleBrain from '../components/ParticleBrain.jsx'
import { AppShell, SimTag, Loading, ErrorBox } from '../components/ui.jsx'
import { ResultTiles, VerdictDots, VERDICT } from '../components/BrainResult.jsx'
import { Link } from '../router.jsx'
import { useApi } from '../api.js'
import { fmtDate } from '../copy.js'

export default function ParticipantHome({ pid }) {
  const { data, error, loading } = useApi(`/api/participants/${pid}`)
  if (loading) return <AppShell><Loading /></AppShell>
  if (error) return <AppShell><ErrorBox error={error} /></AppShell>

  const p = data.participant
  const latest = data.latest
  const v = latest?.verdict
  const word = v ? VERDICT[v.status] : null
  const done = data.sessions.filter((s) => s.status === 'completed')

  return (
    <AppShell>
      <Link className="back no-print" to="/app">← Everyone</Link>
      <section className="home-hero">
        <div className="hero__brain" aria-hidden="true"><ParticleBrain /></div>
        <div className="home-hero__veil" />
        <div className="home-hero__content">
          <p className="kicker row" style={{ marginBottom: 0 }}>
            {p.nickname || p.code}{p.age ? ` · ${p.age} yrs` : ''} {p.simulated && <SimTag />}
          </p>
          {word ? (
            <>
              <p className="mono muted" style={{ marginTop: 'var(--sp-16)' }}>Last check · {fmtDate(latest.completedAt)}</p>
              <h1 className={`statement home-word home-word--${v.status}`}>{word.word}</h1>
              <p className="lead">{v.reasons?.[0]?.text}</p>
            </>
          ) : (
            <>
              <h1 className="statement">Let’s take your first reading</h1>
              <p className="lead">Put the earbud in, relax for two minutes, and see how your brain is doing.</p>
            </>
          )}
          <div className="row" style={{ marginTop: 'var(--sp-24)' }}>
            {data.consentValid
              ? <Link className="pill pill--solid pill--lg" to={`/app/p/${pid}/check`}>Start EEG check</Link>
              : <Link className="pill pill--solid pill--lg" to={`/app/p/${pid}/consent`}>Agree &amp; start</Link>}
            {latest && <Link className="pill pill--lg" to={`/app/s/${latest.sessionId}`}>Open last report</Link>}
          </div>
        </div>
      </section>

      {latest?.eeg && (
        <div style={{ marginBottom: 'var(--sp-32)' }}>
          <ResultTiles result={latest.eeg} />
        </div>
      )}

      {done.length > 0 && (
        <section className="panel" style={{ marginBottom: 'var(--sp-24)' }}>
          <p className="panel__eyebrow">History</p>
          <h2 className="panel__title">Your results over time</h2>
          <VerdictDots items={done.slice(-12)} />
        </section>
      )}

      <div className="row no-print">
        {done.length > 1 && <Link className="pill pill--quiet" to={`/app/p/${pid}/trends`}>Trends</Link>}
        <Link className="pill pill--quiet" to={`/app/p/${pid}/profile`}>Health profile</Link>
        <Link className="pill pill--quiet" to={`/app/p/${pid}/consent`}>Consent</Link>
      </div>
    </AppShell>
  )
}
