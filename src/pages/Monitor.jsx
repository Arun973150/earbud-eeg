import { useEffect, useRef, useState } from 'react'
import { AppShell, PageHead, Loading, ErrorBox, Choices, Notice } from '../components/ui.jsx'
import { LiveWave } from '../check/EegTask.jsx'
import { MinuteStrip } from '../components/Continuous.jsx'
import { Link } from '../router.jsx'
import { api, useApi, pollJob } from '../api.js'

const LENGTHS = [[5, '5 min (demo)'], [30, '30 min'], [60, '1 hour'], [120, '2 hours']]
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function Monitor({ pid }) {
  const { data, error, loading } = useApi(`/api/participants/${pid}`)
  const [ports, setPorts] = useState(null)
  const [minutes, setMinutes] = useState(60)
  const [job, setJob] = useState(null)
  const [stage, setStage] = useState('setup')
  const [failure, setFailure] = useState(null)
  const [summary, setSummary] = useState(null)
  const cancel = useRef(null)

  useEffect(() => {
    api.get('/api/eeg/ports').then(setPorts).catch(() => setPorts({ ports: [] }))
    return () => cancel.current?.()
  }, [])

  if (loading) return <AppShell><Loading /></AppShell>
  if (error) return <AppShell><ErrorBox error={error} /></AppShell>
  const p = data.participant
  const earbud = ports?.ports?.some((x) => x.arduino)

  const start = async () => {
    setFailure(null)
    try {
      const r = await api.post(`/api/participants/${pid}/monitor`, { mode: earbud ? 'earbud' : 'simulated', maxMinutes: minutes })
      setStage('recording')
      cancel.current = pollJob(r.job.id, (j) => {
        setJob(j)
        if (j.status !== 'running') {
          cancel.current = null
          if (j.status === 'done' || j.status === 'stopped') {
            setSummary(j.result)
            setStage('done')
          } else {
            setFailure(j.error?.message || 'The recording stopped.')
            setStage('setup')
          }
        }
      }, 700)
    } catch (err) {
      setFailure(err.message)
    }
  }
  const stop = async () => {
    if (job) await api.post(`/api/jobs/${job.id}/finish`).catch(() => {})
    setStage('finishing')
  }

  const segs = job?.segments || []
  const elapsed = job?.progress?.elapsed || 0
  const clean = segs.filter((s) => s.clean).length
  const seizureFlag = segs.some((s) => (s.seizure_max ?? 0) > 0.85)

  return (
    <AppShell>
      <PageHead
        back={{ to: `/app/p/${pid}`, label: p.nickname || p.code }}
        kicker="Background screening"
        title="Wear it while you study or listen"
        lead="The earbud keeps recording while you go about your day. Only the still, clean minutes are analysed, and the seizure screen watches the whole time."
      />

      {stage === 'setup' && (
        <section className="panel" style={{ maxWidth: 760 }}>
          <p className="mono muted">{ports === null ? 'Looking for the earbud…' : earbud ? 'Earbud connected' : 'No earbud found: a demo signal will be used'}</p>
          <div style={{ marginTop: 'var(--sp-16)' }}>
            <Choices legend="How long?" name="mon-len" value={minutes} onChange={setMinutes} options={LENGTHS} />
          </div>
          {failure && <p className="error-text" role="alert">{failure}</p>}
          <div className="row" style={{ marginTop: 'var(--sp-20)' }}>
            <button className="pill pill--solid pill--lg" onClick={start}>Start background screening</button>
            <Link className="pill pill--quiet" to={`/app/p/${pid}`}>Back</Link>
          </div>
          <p className="panel__text muted" style={{ marginTop: 'var(--sp-16)' }}>You can stop any time. Recordings are encrypted on this computer.</p>
        </section>
      )}

      {(stage === 'recording' || stage === 'finishing') && (
        <div className="stack stack--lg">
          <section className="panel monitor-live">
            <div className="monitor-stats">
              <div><span className="mono muted">Recording</span><strong>{clock(elapsed)}</strong></div>
              <div><span className="mono muted">Clean minutes</span><strong>{clean} / {segs.length}</strong></div>
              <div className={seizureFlag ? 'is-alert' : ''}><span className="mono muted">Seizure watch</span><strong>{seizureFlag ? 'Check needed' : 'Nothing sustained'}</strong></div>
            </div>
            <LiveWave quality={job?.quality} />
            <p className="panel__text muted">Each square is one minute: clean, movement or noise, or seizure-like.</p>
            <MinuteStrip timeline={segs} total={minutes} />
          </section>
          <div className="row">
            <button className="pill pill--solid pill--lg" onClick={stop} disabled={stage === 'finishing'}>
              {stage === 'finishing' ? 'Finishing and screening…' : 'Stop and save'}
            </button>
          </div>
        </div>
      )}

      {stage === 'done' && summary && (
        <div className="stack stack--lg">
          <section className="panel">
            <p className="panel__eyebrow">Session saved</p>
            <h2 className="panel__title">{summary.clean_minutes} clean minutes out of {summary.minutes}</h2>
            <div className="monitor-stats" style={{ marginTop: 'var(--sp-16)' }}>
              <div><span className="mono muted">Brain rhythm speed</span><strong>{summary.markers?.paf_hz ?? '—'} Hz</strong></div>
              <div><span className="mono muted">Slow-wave balance</span><strong>{summary.markers?.theta_alpha_ratio ?? '—'}</strong></div>
              <div className={summary.seizure_screen?.events?.length ? 'is-alert' : ''}>
                <span className="mono muted">Seizure screen</span>
                <strong>{summary.seizure_screen ? (summary.seizure_screen.events?.length ? `${summary.seizure_screen.events.length} event(s)` : 'None') : 'Not enough clean signal'}</strong>
              </div>
            </div>
            <MinuteStrip timeline={summary.timeline} />
            <div className="row" style={{ marginTop: 'var(--sp-20)' }}>
              <Link className="pill pill--solid" to={`/app/p/${pid}`}>See today’s summary</Link>
              <Link className="pill" to={`/app/p/${pid}/trends`}>Daily trends</Link>
            </div>
          </section>
          <Notice title="Background screening, not a diagnosis.">
            Each day is compared with your own baseline and your sleep and activity. Anything unusual is explained, and a clinician reviews sustained or urgent changes.
          </Notice>
        </div>
      )}
    </AppShell>
  )
}
