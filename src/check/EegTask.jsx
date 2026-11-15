import { useEffect, useRef, useState } from 'react'
import { Choices, Meter, StatusChip, speak } from '../components/ui.jsx'
import { api, pollJob } from '../api.js'
import { chime } from './TaskStage.jsx'

export const EEG_TEXT =
  'Put the earbuds in. When the light turns green, close your eyes and relax. Open them at the chime. Keep your jaw loose.'

const ERRORS = {
  NOT_CONNECTED: 'The earbud is not connected. Plug the Arduino into USB, check the cable, and try again.',
  NO_DATA: 'The earbud is connected but no signal arrived. Check the electrode wiring and that the Arduino firmware is streaming.',
  FLAT_SIGNAL: 'The signal is flat, so the electrode is not touching the skin. Push the earbud gently into place and try again.',
  TIMEOUT: 'The recording took too long and was stopped.',
}

// Live contact quality, using the check_electrode.py thresholds (4 µV good, 2 µV poor).
function ContactMeter({ quality }) {
  if (!quality) return <Meter fraction={0} left="Waiting for signal…" />
  const tone = quality.grade === 'good' ? 'good' : quality.grade === 'poor' ? 'warning' : 'critical'
  const label = quality.railing ? 'Signal saturated: check the wiring' : quality.grade === 'good' ? 'Good contact' : quality.grade === 'poor' ? 'Weak contact: press the earbud in gently' : 'No contact'
  return <Meter fraction={quality.std_uv / 8} tone={tone} left={label} right={`${quality.std_uv} µV`} />
}

// The last 2 s of signal, redrawn on every quality update so the user sees their brainwaves live.
export function LiveWave({ quality, height = 120 }) {
  const wave = quality?.wave
  const W = 600
  if (!wave?.length) return <div className="live-wave live-wave--empty" style={{ height }}>waiting for signal…</div>
  const peak = Math.max(10, ...wave.map(Math.abs))
  const y = (v) => height / 2 - (v / peak) * (height / 2 - 6)
  const d = wave.map((v, i) => `${i ? 'L' : 'M'}${((i / (wave.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const tone = quality.grade === 'good' ? 'var(--status-good)' : quality.grade === 'poor' ? 'var(--status-warning)' : 'var(--status-critical)'
  return (
    <svg className="live-wave" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Live EEG, ${quality.std_uv} microvolts`}>
      <line x1="0" x2={W} y1={height / 2} y2={height / 2} stroke="rgba(255,255,255,0.1)" />
      <path d={d} fill="none" stroke={tone} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

async function waitUntilStopped(jobId) {
  for (let i = 0; i < 20; i++) {
    const { job } = await api.get(`/api/jobs/${jobId}`).catch(() => ({ job: null }))
    if (!job || job.status !== 'running') return
    await new Promise((r) => setTimeout(r, 200))
  }
}

export function EegTask({ sessionId, onDone, onSkip, onDim }) {
  const [stage, setStage] = useState('setup')
  const [ports, setPorts] = useState(null)
  const [mode, setMode] = useState('earbud')
  const [seconds, setSeconds] = useState(60)
  const [autoIn, setAutoIn] = useState(null)
  const goodStreak = useRef(0)
  const [quality, setQuality] = useState(null)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const contact = useRef(null)
  const recording = useRef(null)
  const lastPhase = useRef(null)

  useEffect(() => {
    api.get('/api/eeg/ports')
      .then((r) => {
        setPorts(r)
        const found = r.ports.some((p) => p.arduino)
        if (!found) setMode('simulated')
        startContact(found ? 'earbud' : 'simulated')
      })
      .catch(() => setPorts({ ports: [], selected: null }))
    return () => {
      stopContact()
      if (recording.current) {
        recording.current.cancel()
        api.del(`/api/jobs/${recording.current.jobId}`).catch(() => {})
      }
      onDim(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function stopContact() {
    const c = contact.current
    if (!c) return
    contact.current = null
    c.cancel()
    await api.del(`/api/jobs/${c.jobId}`).catch(() => {})
    await waitUntilStopped(c.jobId)
  }

  async function startContact(chosen = mode) {
    setError(null)
    setQuality(null)
    setStage('contact')
    try {
      const { job: j } = await api.post('/api/eeg/contact', { simulate: chosen === 'simulated' })
      goodStreak.current = 0
      const cancel = pollJob(j.id, (update) => {
        if (update.quality) {
          setQuality(update.quality)
          goodStreak.current = update.quality.grade === 'good' ? goodStreak.current + 1 : 0
          if (goodStreak.current === 4) setAutoIn(3)
        }
        if (update.status === 'error') {
          setError(update.error)
          setStage('error')
        }
      }, 500)
      contact.current = { jobId: j.id, cancel }
    } catch (err) {
      setError({ message: err.message })
      setStage('error')
    }
  }

  async function startRecording() {
    await stopContact()
    setError(null)
    setJob(null)
    lastPhase.current = null
    setStage('recording')
    try {
      const { job: j } = await api.post(`/api/sessions/${sessionId}/eeg`, { mode, closed: seconds, open: seconds })
      const cancel = pollJob(j.id, (update) => {
        setJob(update)
        if (update.quality) setQuality(update.quality)
        const phase = update.progress?.phase
        if (phase && phase !== lastPhase.current) {
          lastPhase.current = phase
          if (phase === 'eyes_closed') {
            onDim(true)
            speak('Close your eyes and relax. Keep still. A chime will tell you when to open them.')
          } else if (phase === 'eyes_open') {
            onDim(false)
            chime()
            speak('Open your eyes. Look at the dot.')
          } else if (phase === 'processing') {
            chime()
          }
        }
        if (update.status !== 'running') {
          recording.current = null
          onDim(false)
          if (update.status === 'done') onDone(update.result)
          else {
            setError(update.error || { message: 'The recording stopped.' })
            setStage('error')
          }
        }
      }, 500)
      recording.current = { jobId: j.id, cancel }
    } catch (err) {
      setError({ message: err.message })
      setStage('error')
    }
  }

  async function stopRecording() {
    const r = recording.current
    if (r) {
      recording.current = null
      r.cancel()
      await api.del(`/api/jobs/${r.jobId}`).catch(() => {})
    }
    onDim(false)
    setStage('setup')
  }

  const detected = ports?.ports?.find((p) => p.arduino)

  // Good contact for ~2 s: count down 3-2-1 and start the recording without a click.
  useEffect(() => {
    if (autoIn === null || stage !== 'contact') return
    if (autoIn <= 0) {
      setAutoIn(null)
      startRecording()
      return
    }
    const t = setTimeout(() => setAutoIn((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(t)
  }, [autoIn, stage]) // eslint-disable-line react-hooks/exhaustive-deps

  if (stage === 'setup') {
    return (
      <>
        <h2 className="task-title">Resting brain rhythm</h2>
        <p className="task-text">{EEG_TEXT}</p>
        <p className="mono" style={{ color: 'var(--color-fog)' }}>
          {ports === null ? 'Looking for the earbud…' : detected ? `Earbud found on ${detected.device}` : 'No earbud found'}
        </p>
        <div className="grid-2" style={{ textAlign: 'left', width: 'min(720px, 100%)' }}>
          <Choices
            legend="Signal"
            name="eeg-source"
            value={mode}
            onChange={setMode}
            options={[['earbud', 'Earbud'], ['simulated', 'Simulated (demo)']]}
          />
          <Choices legend="Length" name="eeg-length" value={seconds} onChange={setSeconds} options={[[30, 'Quick 1 min'], [60, 'Standard 2 min']]} />
        </div>
        {mode === 'simulated' && (
          <p className="field__hint">A simulated signal is clearly marked as simulated in your results, and is for demonstrations only.</p>
        )}
        <div className="task-actions">
          <button type="button" className="pill pill--solid pill--lg" onClick={() => startContact()} autoFocus>Check contact</button>
          <button type="button" className="pill pill--lg" onClick={onSkip}>Skip EEG this time</button>
        </div>
      </>
    )
  }

  if (stage === 'contact') {
    return (
      <>
        <h2 className="task-title">{quality?.grade === 'good' ? 'Good contact' : 'Fit the earbud'}</h2>
        <p className="task-text">{autoIn !== null ? `Starting in ${autoIn}… then close your eyes.` : 'Press the earbuds in gently and keep still until the line turns green.'}</p>
        <LiveWave quality={quality} />
        <p className="mono" style={{ color: 'var(--color-fog)' }}>
          {mode === 'simulated' ? 'Simulated signal (demo)' : `Earbud${detected ? ` on ${detected.device}` : ''}`} · {seconds * 2 / 60} min recording
        </p>
        <ContactMeter quality={quality} />
        <div className="task-actions">
          <button type="button" className="pill pill--solid pill--lg" onClick={() => { setAutoIn(null); startRecording() }} disabled={!quality}>Start now</button>
          <button type="button" className="pill pill--quiet" onClick={async () => { setAutoIn(null); await stopContact(); setStage('setup') }}>Settings</button>
        </div>
      </>
    )
  }

  if (stage === 'recording') {
    const p = job?.progress
    const phase = p?.phase
    const total = p?.total ?? seconds * 2
    const elapsed = p?.elapsed ?? 0
    const remaining = phase === 'eyes_closed' ? Math.max(0, Math.ceil(seconds - elapsed)) : Math.max(0, Math.ceil(total - elapsed))
    return (
      <>
        {phase === 'eyes_closed' && (
          <>
            <p className="mono muted">Eyes closed</p>
            <h2 className="task-title">Close your eyes and relax</h2>
            <div className="countdown" aria-live="off">{remaining}</div>
            <p className="task-text">A chime will tell you when to open them.</p>
          </>
        )}
        {phase === 'eyes_open' && (
          <>
            <p className="mono muted">Eyes open</p>
            <div className="fixation" aria-hidden="true" />
            <h2 className="task-title">Look at the dot</h2>
            <div className="countdown">{remaining}</div>
          </>
        )}
        {(phase === 'processing' || phase === 'screening') && (
          <>
            <h2 className="task-title">{phase === 'processing' ? 'Analysing your recording' : 'Screening for seizure-like activity'}</h2>
            <p className="task-text">This takes up to a minute. You can relax.</p>
          </>
        )}
        {!phase && (
          <>
            <h2 className="task-title">Starting…</h2>
            <p className="task-text">Connecting to the earbud.</p>
          </>
        )}
        {(phase === 'eyes_closed' || phase === 'eyes_open') && <LiveWave quality={quality} height={90} />}
        <div className="task-actions">
          <button type="button" className="pill pill--quiet" onClick={stopRecording}>Stop recording</button>
        </div>
      </>
    )
  }

  if (stage === 'done') {
    const r = job?.result || {}
    const grade = r.quality?.grade
    return (
      <>
        <h2 className="task-title">Recording saved</h2>
        <div className="row" style={{ justifyContent: 'center' }}>
          <StatusChip status={grade === 'poor' ? 'watch' : 'ok'} label={`Signal quality: ${grade || 'unknown'}`} />
          {r.source === 'simulated' && <span className="sim-tag">SIMULATED</span>}
        </div>
        <p className="task-text">
          {grade === 'poor'
            ? 'The signal was noisy, so brain-rhythm results won’t be used this time. Your other results still count.'
            : 'Your brain-rhythm results are ready and will be part of your report.'}
        </p>
        <div className="task-actions">
          <button type="button" className="pill pill--solid pill--lg" onClick={() => onDone(r)} autoFocus>Continue</button>
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="task-title">The EEG step didn’t work</h2>
      <p className="task-text" role="alert">{ERRORS[error?.code] || error?.message || 'Something went wrong.'}</p>
      <div className="task-actions">
        <button type="button" className="pill pill--solid pill--lg" onClick={() => setStage('setup')}>Try again</button>
        {mode !== 'simulated' && (
          <button type="button" className="pill pill--lg" onClick={() => { setMode('simulated'); setStage('setup') }}>Use a simulated signal</button>
        )}
        <button type="button" className="pill pill--lg" onClick={onSkip}>Skip EEG this time</button>
      </div>
    </>
  )
}

// 20 s relaxed baseline that starts the continuous recording kept running through the games.
export function RestBaseline({ sessionId, mode, onDone, onSkip }) {
  const [left, setLeft] = useState(20)
  const [error, setError] = useState(null)
  const jobRef = useRef(null)

  useEffect(() => {
    let timer
    let cancelled = false
    ;(async () => {
      try {
        const { job } = await api.post(`/api/sessions/${sessionId}/task-eeg`, { mode })
        if (cancelled) return
        jobRef.current = job.id
        // Start the 20 s only once the recorder reports it is streaming (Python start-up + earbud reset take a few seconds).
        for (let i = 0; i < 60 && !cancelled; i++) {
          const { job: j } = await api.get(`/api/jobs/${job.id}`)
          if (j.progress) break
          if (j.status !== 'running') throw new Error(j.error?.message || 'The earbud recording stopped.')
          await new Promise((r) => setTimeout(r, 500))
        }
        if (cancelled) return
        await api.post(`/api/jobs/${job.id}/marker`, { label: 'rest', phase: 'start' })
        speak('Look at the dot and relax.')
        const end = Date.now() + 20000
        timer = setInterval(async () => {
          const s = Math.max(0, Math.ceil((end - Date.now()) / 1000))
          setLeft(s)
          if (s <= 0) {
            clearInterval(timer)
            await api.post(`/api/jobs/${job.id}/marker`, { label: 'rest', phase: 'end' }).catch(() => {})
            chime()
            onDone(job.id)
          }
        }, 250)
      } catch (err) {
        setError(err.message)
      }
    })()
    return () => { cancelled = true; clearInterval(timer) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <>
        <h2 className="task-title">Couldn’t keep recording</h2>
        <p className="task-text" role="alert">{error}</p>
        <div className="task-actions"><button type="button" className="pill pill--solid pill--lg" onClick={onSkip}>Continue without EEG</button></div>
      </>
    )
  }
  return (
    <>
      <p className="mono muted">Relaxed baseline · EEG recording</p>
      <div className="fixation" aria-hidden="true" />
      <h2 className="task-title">Look at the dot and relax</h2>
      <div className="countdown">{left}</div>
      <p className="task-text">Then the games start. Your earbud keeps recording so we can see your brain while you concentrate.</p>
    </>
  )
}
