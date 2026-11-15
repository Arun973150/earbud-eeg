import { useEffect, useState } from 'react'
import { AppShell, PageHead, Loading, ErrorBox, StatusChip, SimTag, Notice, Field, Choices } from '../components/ui.jsx'
import { TrendChart, SpectrumChart } from '../components/Charts.jsx'
import { SeizureVerdict, SeizureTimeline, WaveViewer } from '../components/EegViz.jsx'
import { Link, navigate } from '../router.jsx'
import { api, useApi } from '../api.js'
import { METRIC, SERVICE, FACTOR, reasonText, formatValue, fmtDate, pct } from '../copy.js'

const DECISIONS = [['refer', 'Refer'], ['repeat', 'Repeat check'], ['no_action', 'No action: normal variation']]
const REFERENCE = [['not_assessed', 'Not assessed'], ['change_confirmed', 'Meaningful change confirmed'], ['no_change', 'No meaningful change']]
const FAMILY = { dementia: 'Dementia', epilepsy: 'Epilepsy', stroke: 'Stroke', parkinsons: 'Parkinson’s' }
const APOE = { unknown: 'Not known', none: 'No ε4', one: 'One ε4 copy', two: 'Two ε4 copies' }

function DecisionForm({ session }) {
  const ev = session.evaluation
  const prior = session.review?.status === 'completed' ? session.review : null
  const [decision, setDecision] = useState(prior?.decision || (ev.requiresReview ? 'refer' : 'no_action'))
  const [services, setServices] = useState(prior?.services?.length ? prior.services : ev.services)
  const [repeatWeeks, setRepeatWeeks] = useState(prior?.repeatWeeks || 2)
  const [reference, setReference] = useState(prior?.referenceOutcome || 'not_assessed')
  const [notes, setNotes] = useState(prior?.notes || '')
  const [reviewer, setReviewer] = useState(prior?.reviewer || '')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const toggle = (s) => setServices((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]))
  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.post(`/api/sessions/${session.id}/review`, { decision, services, repeatWeeks, referenceOutcome: reference, notes, reviewer })
      navigate('/clinician')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <p className="panel__eyebrow">{ev.requiresReview ? 'Your decision' : 'Reference assessment'}</p>
      <h2 className="panel__title">{prior ? 'Update the decision' : 'Record the decision'}</h2>
      <div className="stack">
        <Choices legend="Decision" name="decision" value={decision} onChange={setDecision} options={DECISIONS} />
        {decision === 'refer' && (
          <fieldset className="field">
            <legend className="field__label">Refer to (system suggestions are pre-selected)</legend>
            {Object.entries(SERVICE).map(([key, label]) => (
              <label className="checkline" key={key} style={{ padding: '10px 0' }}>
                <input type="checkbox" checked={services.includes(key)} onChange={() => toggle(key)} />
                <span>{label}{ev.services.includes(key) ? ' · suggested' : ''}</span>
              </label>
            ))}
          </fieldset>
        )}
        {decision === 'repeat' && (
          <Choices legend="Repeat in" name="weeks" value={repeatWeeks} onChange={setRepeatWeeks} options={[[1, '1 week'], [2, '2 weeks'], [4, '4 weeks'], [12, '3 months']]} />
        )}
        <Choices legend="Clinical assessment result (reference standard)" name="reference" value={reference} onChange={setReference} options={REFERENCE} />
        <Field label="Notes for the participant (plain language)">
          <textarea className="textarea" maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="Your name">
          <input className="input" maxLength={80} value={reviewer} onChange={(e) => setReviewer(e.target.value)} required />
        </Field>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="row">
          <button className="pill pill--solid" type="submit" disabled={saving || (decision === 'refer' && !services.length)}>{saving ? 'Saving…' : 'Save decision'}</button>
          <Link className="pill pill--quiet" to="/clinician">Back to queue</Link>
        </div>
      </div>
    </form>
  )
}

function MetricsTable({ evaluation }) {
  const rows = Object.entries(evaluation.metrics)
  return (
    <div className="table-wrap">
      <table className="metrics metrics--compact">
        <thead>
          <tr><th className="left">Measure</th><th>Today</th><th>Baseline</th><th>Usual range</th><th>RCI</th><th>Since last</th><th className="left">Status</th></tr>
        </thead>
        <tbody>
          {rows.map(([id, m]) => (
            <tr key={id}>
              <td className="left">{METRIC[id]?.label}</td>
              <td className="num">{formatValue(id, m.value)} {METRIC[id]?.unit}</td>
              <td className="num">{m.baseline !== undefined ? formatValue(id, m.baseline) : '—'}</td>
              <td className="num">{m.low !== undefined ? `${formatValue(id, Math.max(0, m.low))}–${formatValue(id, m.high)}` : '—'}</td>
              <td className="num">{m.rci ?? '—'}</td>
              <td className="num">{m.rciPrev ?? '—'}</td>
              <td className="left"><StatusChip status={m.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ClinicianReview({ sid }) {
  const { data, error, loading } = useApi(`/api/sessions/${sid}`)
  const [trends, setTrends] = useState(null)
  useEffect(() => {
    if (data?.session) api.get(`/api/participants/${data.session.participantId}/trends`).then(setTrends).catch(() => setTrends(null))
  }, [data])

  if (loading) return <AppShell><Loading /></AppShell>
  if (error) return <AppShell><ErrorBox error={error} /></AppShell>
  if (!data.clinician) {
    return (
      <AppShell>
        <Notice title="Clinician sign-in needed.">Sign in on the <Link to="/clinician" style={{ textDecoration: 'underline' }}>clinician page</Link> first.</Notice>
      </AppShell>
    )
  }

  const { session: s, participant: p, risk } = data
  const ev = s.evaluation
  const flagged = Object.entries(ev.metrics).filter(([, m]) => ['decline', 'watch'].includes(m.status)).map(([id]) => id)
  const screen = s.eeg?.result?.seizure_screen
  const acc = Object.entries(p.accommodations || {}).filter(([, v]) => v).map(([k]) => k)

  return (
    <AppShell>
      <PageHead
        back={{ to: '/clinician', label: 'Review queue' }}
        kicker={<>Review · {p.code} · check of {fmtDate(s.completedAt)} {p.simulated && <SimTag />}</>}
        title={ev.requiresReview ? 'Flagged for review' : 'Reference assessment'}
        lead={ev.reasons.map(reasonText).join(' ')}
      >
        <StatusChip status={ev.outcome} />
      </PageHead>

      <div className="grid-aside">
        <div className="stack stack--lg">
          <section className="panel">
            <p className="panel__eyebrow">Participant</p>
            <p className="panel__text">
              {p.age} years · {p.sex || 'sex not stated'} · {p.educationYears} years of schooling · first language {p.primaryLanguage || '—'} ·
              digital familiarity {p.digitalFamiliarity || '—'}.
              {acc.length ? ` Accommodations: ${acc.join(', ')}.` : ''}
            </p>
            <p className="panel__text">
              Today: slept {s.context?.sleepHours ?? '—'} h{s.context?.fasting ? ', fasting' : ''}{s.context?.unwell ? ', unwell' : ''}{s.context?.assisted ? ', assisted' : ''}.
              {ev.confounders.length ? ' Results may be affected.' : ''}
            </p>
          </section>

          <section className="panel">
            <p className="panel__eyebrow">Change against personal baseline</p>
            <MetricsTable evaluation={ev} />
            <p className="field__hint" style={{ marginTop: 'var(--sp-12)' }}>
              RCI = change from baseline ÷ standard error of the difference. Below −1.96 is a reliable decline; “since last” is the
              same measure against the previous valid check (below −3 in two domains is treated as rapid change).
            </p>
          </section>

          {trends && flagged.map((id) => trends.metrics[id] && (
            <section className="panel" key={id}>
              <p className="panel__eyebrow">Trend</p>
              <h3 className="panel__title">{METRIC[id].label}</h3>
              <TrendChart id={id} points={trends.metrics[id].points} band={trends.metrics[id].band} height={200} />
            </section>
          ))}

          {s.eeg?.result && <SeizureVerdict screen={screen} quality={s.eeg.result.quality?.grade} />}
          {s.eeg?.result && <SeizureTimeline screen={screen} eyesOpenAt={s.eeg.result.protocol?.eyes_closed_s} />}
          {s.eeg?.result?.waveform && <WaveViewer waveform={s.eeg.result.waveform} />}
          {s.eeg?.result && (
            <section className="panel">
              <p className="panel__eyebrow">EEG · signal {s.eeg.result.quality?.grade}</p>
              {s.eeg.result.spectra && <SpectrumChart spectra={s.eeg.result.spectra} paf={s.eeg.result.features?.paf_hz} height={220} />}
              <p className="panel__text" style={{ marginTop: 'var(--sp-12)' }}>
                Seizure screen: {screen ? `${screen.decision} (highest window ${pct(screen.probability_max)})` : 'not run'}.
              </p>
            </section>
          )}
        </div>

        <aside className="stack">
          <DecisionForm session={s} />
          <section className="panel">
            <p className="panel__eyebrow">Risk context</p>
            <div className="factor-chips" style={{ margin: 'var(--sp-8) 0' }}>
              {risk.factors.filter((f) => f.status === 'present').map((f) => <span className="tag" key={f.id}>{FACTOR[f.id]}</span>)}
            </div>
            <p className="panel__text">
              {risk.caide?.eligible ? `CAIDE ${risk.caide.points}/15 (band ${risk.caide.range}, ${risk.caide.risk20y}% 20-year risk in the derivation cohort).` : 'CAIDE not applicable.'}
            </p>
            <p className="panel__text">
              Family history: {Object.entries(risk.familyHistory || {}).filter(([, v]) => v === 'yes').map(([k]) => FAMILY[k]).join(', ') || 'none recorded'}.
              {risk.apoe ? ` APOE: ${APOE[risk.apoe] || risk.apoe}.` : ' APOE: no genomic consent.'}
            </p>
            {typeof ev.flags.phq2 === 'number' && <p className="panel__text">PHQ-2 {ev.flags.phq2}/6 · GAD-2 {ev.flags.gad2 ?? '—'}/6{typeof ev.flags.function_score === 'number' ? ` · daily function ${ev.flags.function_score}/16` : ''}.</p>}
          </section>
        </aside>
      </div>
    </AppShell>
  )
}
