import { useEffect, useState } from 'react'
import { AppShell, PageHead, Loading, ErrorBox } from '../components/ui.jsx'
import { navigate } from '../router.jsx'
import { api, useApi } from '../api.js'

const CATEGORIES = [
  ['tasks', 'The brain check', 'The EEG check and the optional memory and focus games. Needed to take a check.', true],
  ['eeg', 'EEG recording from the earbud', 'Two minutes of resting brain activity, saved as an EDF file and screened for seizure-like activity.'],
  ['questionnaires', 'Mood and daily-life questions', 'Two short mood questions, two on worry, and (monthly) eight questions about everyday tasks.'],
  ['riskFactors', 'Health and lifestyle information', 'Blood pressure, cholesterol, sleep, activity, smoking, family history and similar, used to build your prevention plan.'],
  ['genomic', 'Genetic information (APOE)', 'Only if you already know your APOE result. It is optional, kept separate, and never required.'],
  ['shareWithClinician', 'Sharing with a clinician', 'Abnormal results are also sent to a clinician for a second look.'],
  ['shareWithFamily', 'Sharing with a family member or carer', 'A person you choose may sit in and see your results.'],
]

const DEFAULTS = { tasks: true, eeg: true, questionnaires: true, riskFactors: true, shareWithClinician: true, genomic: false, shareWithFamily: false }

export default function Consent({ pid }) {
  const { data, error, loading } = useApi(`/api/participants/${pid}`)
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    if (data) setValues(data.consentValid ? data.participant.consent.categories : DEFAULTS)
  }, [data])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      await api.put(`/api/participants/${pid}/consent`, { categories: values })
      navigate(data.consentValid ? `/app/p/${pid}` : `/app/p/${pid}/check`)
    } catch (err) {
      setMessage(err.message)
      setSaving(false)
    }
  }

  const withdraw = async () => {
    await api.put(`/api/participants/${pid}/consent`, { withdraw: true })
    navigate(`/app/p/${pid}`)
  }

  if (loading) return <AppShell><Loading /></AppShell>
  if (error) return <AppShell><ErrorBox error={error} /></AppShell>
  const p = data.participant

  return (
    <AppShell>
      <PageHead
        back={{ to: `/app/p/${pid}`, label: p.nickname || p.code }}
        kicker="Before you start"
        title="Your data stays with you"
        lead="Your EEG is saved on this computer only. This is a screen, not a diagnosis. You can change your mind any time."
      />
      <form className="panel" onSubmit={save} style={{ maxWidth: 760 }}>
        <details className="disclosure">
          <summary>Choose what to share</summary>
          {CATEGORIES.map(([key, title, body, required]) => (
            <label className="checkline" key={key}>
              <input type="checkbox" checked={Boolean(values[key])} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked }))} />
              <span>
                <strong>{title}{required ? ' (required)' : ''}</strong>
                {body}
              </span>
            </label>
          ))}
        </details>
          {message && <p className="error-text" role="alert">{message}</p>}
          <div className="row" style={{ marginTop: 'var(--sp-20)' }}>
            <button className="pill pill--solid pill--lg" type="submit" disabled={saving || !values.tasks}>{data.consentValid ? 'Save' : 'I agree, start'}</button>
            {data.consentValid && <button className="pill pill--quiet" type="button" onClick={withdraw}>Withdraw consent</button>}
          </div>
        </form>
    </AppShell>
  )
}
