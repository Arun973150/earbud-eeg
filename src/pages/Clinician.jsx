import { useState } from 'react'
import { AppShell, PageHead, Loading, ErrorBox, StatusChip, SimTag, Field, Notice } from '../components/ui.jsx'
import { Link } from '../router.jsx'
import { api, useApi } from '../api.js'
import { reasonText, fmtDate, SERVICE } from '../copy.js'

function SignIn({ onSignedIn }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await api.post('/api/clinician/login', { pin })
      onSignedIn()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <form className="panel" onSubmit={submit} style={{ maxWidth: 460 }}>
      <p className="panel__eyebrow">Clinician access</p>
      <h2 className="panel__title">Sign in to review results</h2>
      <Field label="PIN" hint="Demo PIN is set by CLINICIAN_PIN on the server (default 1234). A real deployment would use hospital sign-in.">
        <input className="input" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus />
      </Field>
      {error && <p className="error-text" role="alert" style={{ marginTop: 'var(--sp-12)' }}>{error}</p>}
      <button className="pill pill--solid" type="submit" style={{ marginTop: 'var(--sp-16)' }}>Sign in</button>
    </form>
  )
}

function QueueRow({ item, done }) {
  const p = item.participant
  return (
    <Link className="list-row" to={`/clinician/s/${item.sessionId}`}>
      <div>
        <div className="list-row__title">
          {p.code} {p.simulated && <SimTag />}
        </div>
        <div className="list-row__meta">
          {p.age} yrs · {p.primaryLanguage || '—'} · checked {fmtDate(item.completedAt)}
          {done ? ` · ${item.review.decision.replace('_', ' ')}${item.review.services?.length ? `: ${item.review.services.map((s) => SERVICE[s]).join(', ')}` : ''}` : ` · waiting ${item.waitingDays} days`}
        </div>
        {!done && <p className="panel__text" style={{ marginTop: 6 }}>{item.reasons.filter((r) => r.key !== 'confounded').map(reasonText).join(' ')}</p>}
      </div>
      <StatusChip status={item.outcome} />
    </Link>
  )
}

function Queue({ onSignOut }) {
  const { data, error, loading } = useApi('/api/clinician/queue')
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  return (
    <div className="stack stack--lg">
      <section className="panel">
        <div className="row row--between">
          <div>
            <p className="panel__eyebrow">Needs review</p>
            <h2 className="panel__title">{data.pending.length} waiting</h2>
          </div>
          <button className="pill pill--quiet" onClick={onSignOut}>Sign out</button>
        </div>
        <p className="panel__text" style={{ marginBottom: 'var(--sp-12)' }}>Urgent first, then longest waiting. Participants see flagged results only after your review.</p>
        <div className="list">
          {data.pending.length === 0 && <p className="panel__text muted">Nothing waiting.</p>}
          {data.pending.map((item) => <QueueRow key={item.sessionId} item={item} />)}
        </div>
      </section>

      <section className="panel">
        <p className="panel__eyebrow">Validation sample</p>
        <h2 className="panel__title">Reference assessments</h2>
        <p className="panel__text">
          About 1 in 5 real participants who were never flagged are listed here. Recording a clinical assessment for them
          lets the validation page measure specificity properly instead of assuming it.
        </p>
        <div className="list" style={{ marginTop: 'var(--sp-12)' }}>
          {data.verification.length === 0 && <p className="panel__text muted">No one in the sample yet.</p>}
          {data.verification.map((v) => (
            <Link className="list-row" key={v.sessionId} to={`/clinician/s/${v.sessionId}`}>
              <div>
                <div className="list-row__title">{v.participant.code}</div>
                <div className="list-row__meta">{v.participant.age} yrs · latest check {fmtDate(v.completedAt)}</div>
              </div>
              <span className="mono muted">Record assessment →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel">
        <p className="panel__eyebrow">Recent decisions</p>
        <div className="list" style={{ marginTop: 'var(--sp-12)' }}>
          {data.recent.map((item) => <QueueRow key={item.sessionId} item={item} done />)}
        </div>
      </section>
    </div>
  )
}

export default function Clinician() {
  const status = useApi('/api/status')
  const signOut = async () => {
    await api.post('/api/clinician/logout')
    status.reload()
  }
  return (
    <AppShell>
      <PageHead
        kicker="Human oversight"
        title="Clinician review"
        lead="Abnormal, rapidly changing and high-risk results wait here for a qualified decision before the participant sees them as a referral."
      />
      {status.loading ? <Loading /> : status.error ? <ErrorBox error={status.error} /> : status.data.clinician ? <Queue onSignOut={signOut} /> : (
        <div className="grid-aside">
          <SignIn onSignedIn={status.reload} />
          <Notice title="Why this exists.">
            The challenge asks for qualified review of abnormal, rapidly changing or high-risk results. Nothing flagged
            reaches the participant as a referral until a clinician has looked at it.
          </Notice>
        </div>
      )}
    </AppShell>
  )
}
