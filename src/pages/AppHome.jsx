import { useState } from 'react'
import { AppShell, PageHead, SimTag, Loading, ErrorBox, Field } from '../components/ui.jsx'
import { VERDICT } from '../components/BrainResult.jsx'
import { Link, navigate } from '../router.jsx'
import { api, useApi } from '../api.js'
import { fmtDate } from '../copy.js'

const YEAR = new Date().getFullYear()

function NewPerson({ onCancel }) {
  const [nickname, setNickname] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { participant } = await api.post('/api/participants', { nickname, birthYear: Number(birthYear) })
      navigate(`/app/p/${participant.id}/consent`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="panel reveal in" onSubmit={submit} style={{ marginBottom: 'var(--sp-32)' }}>
      <p className="panel__eyebrow">New person</p>
      <div className="form-grid">
        <Field label="Name">
          <input className="input" value={nickname} maxLength={40} onChange={(e) => setNickname(e.target.value)} autoFocus />
        </Field>
        <Field label="Year of birth">
          <input className="input" type="number" required min={1920} max={YEAR - 18} value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
        </Field>
      </div>
      {error && <p className="error-text" role="alert" style={{ marginTop: 'var(--sp-16)' }}>{error}</p>}
      <div className="row" style={{ marginTop: 'var(--sp-20)' }}>
        <button className="pill pill--solid" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Continue'}</button>
        <button className="pill pill--quiet" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function VerdictChip({ status }) {
  const v = VERDICT[status]
  if (!v) return <span className="mono muted">No checks yet</span>
  return (
    <span className={`chip tone-${v.tone}`}>
      <span className="chip__icon" aria-hidden="true">{v.icon}</span>{v.word}
    </span>
  )
}

export default function AppHome() {
  const { data, error, loading } = useApi('/api/participants')
  const [creating, setCreating] = useState(false)
  const [showSim, setShowSim] = useState(true)
  const people = (data?.participants || []).filter((p) => showSim || !p.simulated)

  return (
    <AppShell>
      <PageHead kicker="Brain check" title="Who’s checking?" lead="Pick your name, or add yourself. Takes 3 minutes with the earbud.">
        {!creating && <button className="pill pill--solid pill--lg" onClick={() => setCreating(true)}>+ New person</button>}
      </PageHead>

      {creating && <NewPerson onCancel={() => setCreating(false)} />}

      <div className="row row--between" style={{ marginBottom: 'var(--sp-12)' }}>
        <span />
        <label className="row mono muted" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={showSim} onChange={(e) => setShowSim(e.target.checked)} style={{ accentColor: 'var(--color-ember)' }} />
          Show demo people
        </label>
      </div>

      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="list">
          {people.length === 0 && <p className="panel__text muted" style={{ padding: 'var(--sp-24) 0' }}>No one yet. Add yourself to start.</p>}
          {people.map((p) => (
            <Link className="list-row" key={p.id} to={`/app/p/${p.id}`}>
              <div>
                <div className="list-row__title">
                  {p.nickname || p.code}
                  {p.simulated && <SimTag />}
                </div>
                <div className="list-row__meta">
                  {p.age ?? '—'} yrs · {p.checks} check{p.checks === 1 ? '' : 's'}{p.lastCheckAt ? ` · last ${fmtDate(p.lastCheckAt)}` : ''}
                </div>
              </div>
              <VerdictChip status={p.lastVerdict} />
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  )
}
