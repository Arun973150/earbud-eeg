import { useEffect, useState } from 'react'
import { AppShell, PageHead, Loading, ErrorBox, Field, Choices, Notice, StatusChip } from '../components/ui.jsx'
import { Link } from '../router.jsx'
import { api, useApi } from '../api.js'
import { FACTOR } from '../copy.js'

const YES_NO = [['yes', 'Yes'], ['no', 'No']]
const FAMILY = [['dementia', 'Dementia'], ['epilepsy', 'Epilepsy'], ['stroke', 'Stroke'], ['parkinsons', 'Parkinson’s']]

function NumberField({ label, hint, value, onChange, min, max, step = 'any' }) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" type="number" min={min} max={max} step={step} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    </Field>
  )
}

function RiskPanel({ summary }) {
  if (!summary) return null
  const caide = summary.caide
  return (
    <aside className="stack">
      <section className="panel">
        <p className="panel__eyebrow">Lancet Commission 2024</p>
        <h2 className="panel__title">14 modifiable risk factors</h2>
        <p className="panel__text">Together these account for about 45% of dementia worldwide. Each one you can change lowers your risk.</p>
        <div className="list" style={{ marginTop: 'var(--sp-12)' }}>
          {summary.factors.map((f) => (
            <div className="list-row" key={f.id} style={{ padding: '10px 0' }}>
              <span className="panel__text">{FACTOR[f.id]}</span>
              <StatusChip
                status={f.status === 'present' ? 'watch' : f.status === 'absent' ? 'ok' : 'baseline'}
                label={f.status === 'present' ? 'Present' : f.status === 'absent' ? 'Not present' : 'Not answered'}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <p className="panel__eyebrow">CAIDE midlife risk score</p>
        {caide.eligible ? (
          <>
            <h2 className="panel__title">{caide.points} / 15 points</h2>
            <p className="panel__text">
              In the original Finnish study, people scoring {caide.range} had about a {caide.risk20y}% chance of dementia
              over 20 years. It has not been validated in this population yet, so treat it as context, not a prediction.
            </p>
          </>
        ) : (
          <p className="panel__text" style={{ marginTop: 'var(--sp-8)' }}>
            {caide.reason === 'age'
              ? 'CAIDE is designed for ages 39 to 64, so it is not shown.'
              : 'Add blood pressure, height and weight, cholesterol and activity to see this score.'}
          </p>
        )}
      </section>
    </aside>
  )
}

export default function Profile({ pid }) {
  const { data, error, loading } = useApi(`/api/participants/${pid}`)
  const [risk, setRisk] = useState(null)
  const [summary, setSummary] = useState(null)
  const [status, setStatus] = useState(null)

  useEffect(() => {
    if (data) {
      setRisk({ familyHistory: {}, ...data.participant.risk })
      setSummary(data.risk)
    }
  }, [data])

  if (loading || (data && !risk)) return <AppShell><Loading /></AppShell>
  if (error) return <AppShell><ErrorBox error={error} /></AppShell>

  const p = data.participant
  const consent = data.consentValid ? p.consent.categories : {}
  const set = (k) => (v) => setRisk((r) => ({ ...r, [k]: v }))
  const setFamily = (k) => (v) => setRisk((r) => ({ ...r, familyHistory: { ...r.familyHistory, [k]: v } }))

  const save = async (e) => {
    e.preventDefault()
    setStatus({ saving: true })
    try {
      const res = await api.put(`/api/participants/${pid}/risk`, risk)
      setSummary(res.summary)
      setStatus({ saved: true })
    } catch (err) {
      setStatus({ error: err.message })
    }
  }

  return (
    <AppShell>
      <PageHead
        back={{ to: `/app/p/${pid}`, label: p.nickname || p.code }}
        kicker="Health profile"
        title="The rest of the picture"
        lead="Body, sleep, mood and family history all shape brain health. Fill in what you know; leave the rest blank."
      />
      {!consent.riskFactors ? (
        <Notice title="Consent needed.">
          Storing health information needs your consent. <Link to={`/app/p/${pid}/consent`} style={{ textDecoration: 'underline' }}>Review consent</Link>.
        </Notice>
      ) : (
        <div className="grid-aside">
          <form className="panel" onSubmit={save}>
            <div className="form-section">
              <h2 className="form-section__title">Body & heart</h2>
              <div className="form-grid">
                <NumberField label="Height (cm)" value={risk.heightCm} onChange={set('heightCm')} min={100} max={230} />
                <NumberField label="Weight (kg)" value={risk.weightKg} onChange={set('weightKg')} min={25} max={300} />
                <NumberField label="Blood pressure, top number" hint="Systolic, in mmHg" value={risk.systolicBP} onChange={set('systolicBP')} min={70} max={260} />
                <NumberField label="Active minutes per week" hint="Brisk walking or more" value={risk.activityMinutes} onChange={set('activityMinutes')} min={0} max={3000} />
              </div>
              <div className="grid-2" style={{ marginTop: 'var(--sp-16)' }}>
                <Choices legend="Told you have high blood pressure?" name="hypertension" value={risk.hypertension} onChange={set('hypertension')} options={YES_NO} />
                <Choices legend="Diabetes?" name="diabetes" value={risk.diabetes} onChange={set('diabetes')} options={YES_NO} />
              </div>
              <div className="form-grid" style={{ marginTop: 'var(--sp-16)' }}>
                <NumberField label="Total cholesterol (mmol/L)" value={risk.totalCholesterol} onChange={set('totalCholesterol')} min={1} max={20} />
                <NumberField label="LDL cholesterol (mmol/L)" value={risk.ldl} onChange={set('ldl')} min={0.5} max={15} />
              </div>
            </div>

            <div className="form-section">
              <h2 className="form-section__title">Senses & head</h2>
              <div className="grid-2">
                <Choices legend="Difficulty hearing conversations?" name="hearing" value={risk.hearingDifficulty} onChange={set('hearingDifficulty')} options={YES_NO} />
                <Choices legend="Difficulty seeing, even with glasses?" name="vision" value={risk.visionDifficulty} onChange={set('visionDifficulty')} options={YES_NO} />
                <Choices legend="Ever had a head injury with loss of consciousness?" name="head" value={risk.headInjury} onChange={set('headInjury')} options={YES_NO} />
              </div>
            </div>

            <div className="form-section">
              <h2 className="form-section__title">Sleep & wellbeing</h2>
              <div className="form-grid">
                <NumberField label="Usual hours of sleep" value={risk.sleepHours} onChange={set('sleepHours')} min={0} max={16} step={0.5} />
              </div>
              <div className="grid-2" style={{ marginTop: 'var(--sp-16)' }}>
                <Choices legend="Sleep quality" name="sleepq" value={risk.sleepQuality} onChange={set('sleepQuality')} options={[[1, 'Very poor'], [2, 'Poor'], [3, 'OK'], [4, 'Good'], [5, 'Very good']]} />
                <Choices legend="Loud snoring or pauses in breathing?" name="snoring" value={risk.snoring} onChange={set('snoring')} options={YES_NO} />
                <Choices legend="Ever diagnosed with depression?" name="depression" value={risk.depression} onChange={set('depression')} options={YES_NO} />
                <Choices legend="Often lonely or with little contact with others?" name="isolated" value={risk.isolated} onChange={set('isolated')} options={YES_NO} />
              </div>
            </div>

            <div className="form-section">
              <h2 className="form-section__title">Lifestyle & surroundings</h2>
              <div className="grid-2">
                <Choices legend="Smoking" name="smoking" value={risk.smoking} onChange={set('smoking')} options={[['never', 'Never'], ['former', 'Used to'], ['current', 'Currently']]} />
                <Choices legend="Live or work with heavy traffic, smoke or dust most days?" name="air" value={risk.airPollution} onChange={set('airPollution')} options={YES_NO} />
              </div>
              <div className="form-grid" style={{ marginTop: 'var(--sp-16)' }}>
                <NumberField label="Alcohol units per week (optional)" hint="Leave blank if you prefer not to say" value={risk.alcoholUnits} onChange={set('alcoholUnits')} min={0} max={200} />
              </div>
            </div>

            <div className="form-section">
              <h2 className="form-section__title">Family history</h2>
              <p className="field__hint" style={{ marginBottom: 'var(--sp-12)' }}>A parent, brother or sister who had…</p>
              <div className="grid-2">
                {FAMILY.map(([k, label]) => (
                  <Choices key={k} legend={label} name={`fh-${k}`} value={risk.familyHistory?.[k] ?? null} onChange={setFamily(k)} options={YES_NO} />
                ))}
              </div>
            </div>

            <div className="form-section">
              <h2 className="form-section__title">Genetics (optional)</h2>
              {consent.genomic ? (
                <Choices
                  legend="APOE ε4 result, if you have had the test"
                  name="apoe"
                  value={risk.apoe ?? null}
                  onChange={set('apoe')}
                  options={[['unknown', 'Not tested / don’t know'], ['none', 'No ε4 copies'], ['one', 'One copy'], ['two', 'Two copies']]}
                />
              ) : (
                <p className="panel__text muted">Genetic information is only stored with separate consent.</p>
              )}
              <p className="field__hint" style={{ marginTop: 'var(--sp-8)' }}>
                APOE ε4 raises risk but does not decide it. Many carriers never develop dementia, and many people with dementia are not carriers.
              </p>
            </div>

            <div className="row" style={{ marginTop: 'var(--sp-24)' }}>
              <button className="pill pill--solid" type="submit" disabled={status?.saving}>{status?.saving ? 'Saving…' : 'Save profile'}</button>
              {status?.saved && <span className="mono" role="status">Saved</span>}
              {status?.error && <span className="error-text" role="alert">{status.error}</span>}
            </div>
          </form>
          <RiskPanel summary={summary} />
        </div>
      )}
    </AppShell>
  )
}
