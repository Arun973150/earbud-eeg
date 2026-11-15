import { useEffect, useRef, useState } from 'react'
import { AppShell, PageHead, Loading, ErrorBox, Choices } from '../components/ui.jsx'
import { TaskStage } from '../check/TaskStage.jsx'
import { EegTask, EEG_TEXT } from '../check/EegTask.jsx'
import { Link, navigate } from '../router.jsx'
import { api, useApi } from '../api.js'
import { ABANDON_REASONS } from '../copy.js'

export function StopDialog({ onCancel, onConfirm }) {
  const [reason, setReason] = useState(null)
  return (
    <>
      <h2 className="task-title">Stop?</h2>
      <div style={{ textAlign: 'left' }}>
        <Choices name="abandon" value={reason} onChange={setReason} options={ABANDON_REASONS} />
      </div>
      <div className="task-actions">
        <button type="button" className="pill pill--solid pill--lg" onClick={() => onConfirm(reason || 'other')}>Stop</button>
        <button type="button" className="pill pill--lg" onClick={onCancel} autoFocus>Keep going</button>
      </div>
    </>
  )
}

// The whole check: fit the earbud, record two minutes, see the result.
export default function Check({ pid }) {
  const { data, error, loading } = useApi(`/api/participants/${pid}`)
  const [session, setSession] = useState(null)
  const [stopping, setStopping] = useState(false)
  const [dim, setDim] = useState(false)
  const [failure, setFailure] = useState(null)
  const started = useRef(false)

  const canEeg = Boolean(data?.consentValid && data.participant.consent?.categories?.eeg)

  useEffect(() => {
    if (!data) return
    if (!data.consentValid) {
      navigate(`/app/p/${pid}/consent`, { replace: true })
      return
    }
    if (!canEeg || started.current) return
    started.current = true
    api.post(`/api/participants/${pid}/sessions`, { kind: 'eeg' }).then(setSession).catch((err) => setFailure(err.message))
  }, [data, pid, canEeg])

  if (loading) return <AppShell><Loading /></AppShell>
  if (error) return <AppShell><ErrorBox error={error} /></AppShell>
  if (!data.consentValid) return null
  if (!canEeg) {
    return (
      <AppShell>
        <PageHead back={{ to: `/app/p/${pid}`, label: 'Back' }} kicker="EEG check" title="EEG isn’t switched on" lead="Your consent doesn’t include EEG recording yet." />
        <Link className="pill pill--solid" to={`/app/p/${pid}/consent`}>Update consent</Link>
      </AppShell>
    )
  }
  if (failure) return <AppShell><ErrorBox error={{ message: failure }} /></AppShell>
  if (!session) return <AppShell><Loading /></AppShell>

  const stop = async (reason) => {
    await api.post(`/api/sessions/${session.sessionId}/abandon`, { reason, step: 'eeg' }).catch(() => {})
    navigate(`/app/p/${pid}`)
  }

  const submit = async () => {
    setFailure(null)
    try {
      await api.post(`/api/sessions/${session.sessionId}/complete`, { raw: {}, skipped: [] })
      navigate(`/app/s/${session.sessionId}`)
    } catch (err) {
      setFailure(err.message)
    }
  }

  return (
    <TaskStage
      index={1} total={1} label="EEG check" instructions={EEG_TEXT}
      autoSpeak={data.participant.accommodations?.readAloud}
      dim={dim && !stopping}
      onStop={stopping ? null : () => setStopping(true)}
    >
      {stopping
        ? <StopDialog onCancel={() => setStopping(false)} onConfirm={stop} />
        : <EegTask sessionId={session.sessionId} onDone={submit} onSkip={() => stop('technical')} onDim={setDim} />}
    </TaskStage>
  )
}
