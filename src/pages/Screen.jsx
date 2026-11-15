import { useEffect, useRef, useState } from 'react'
import { AppShell, PageHead, Notice, SafetyNotice } from '../components/ui.jsx'
import { SeizureVerdict, SeizureTimeline } from '../components/EegViz.jsx'
import { api, pollJob } from '../api.js'

export default function Screen() {
  const [file, setFile] = useState(null)
  const [over, setOver] = useState(false)
  const [job, setJob] = useState(null)
  const [error, setError] = useState(null)
  const cancel = useRef(null)
  const input = useRef(null)

  useEffect(() => () => cancel.current?.(), [])

  const run = async () => {
    if (!file) return
    setError(null)
    setJob({ status: 'running' })
    const form = new FormData()
    form.append('edfFile', file)
    try {
      const { job: j } = await api.post('/api/screen', form)
      cancel.current = pollJob(j.id, setJob, 1000)
    } catch (err) {
      setJob(null)
      setError(err.message)
    }
  }

  const pick = (f) => {
    if (f && !/\.edf$/i.test(f.name)) {
      setError('Please choose an .edf file.')
      return
    }
    setError(null)
    setJob(null)
    setFile(f || null)
  }

  const r = job?.status === 'done' ? job.result : null
  return (
    <AppShell>
      <PageHead
        kicker="Seizure screen"
        title="Screen an EDF recording"
        lead="Upload any EEG recording in EDF format. The CNN-GRU model scores every 4-second window for seizure-like activity."
      />
      <div className="grid-aside">
        <div className="stack">
          <section className="panel">
            <div
              className={`drop${over ? ' is-over' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => input.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]) }}
            >
              <p className="panel__title" style={{ margin: 0 }}>{file ? file.name : 'Drop an .edf file here'}</p>
              <p className="panel__text muted">{file ? `${(file.size / 1024).toFixed(0)} KB` : 'or click to choose one (up to 50 MB)'}</p>
              <input ref={input} type="file" accept=".edf" hidden onChange={(e) => pick(e.target.files[0])} />
            </div>
            {error && <p className="error-text" role="alert" style={{ marginTop: 'var(--sp-12)' }}>{error}</p>}
            <div className="row" style={{ marginTop: 'var(--sp-16)' }}>
              <button className="pill pill--solid" disabled={!file || job?.status === 'running'} onClick={run}>
                {job?.status === 'running' ? 'Analysing… (up to a minute)' : 'Run seizure screen'}
              </button>
            </div>
          </section>

          {job?.status === 'error' && <Notice kind="alert" title="Could not analyse this file.">{job.error?.message}</Notice>}

          {r && (
            <>
              <p className="mono muted">{r.file} · {r.duration_s} s · channel {r.channel}</p>
              <SeizureVerdict screen={r} />
              <SeizureTimeline screen={r} />
              {r.visualizationUrl && (
                <section className="panel">
                  <p className="panel__eyebrow">Full recording</p>
                  <img className="figure-img" src={r.visualizationUrl} alt="EEG signal, power spectrum, spectrogram and seizure probability per window, with events shaded" />
                </section>
              )}
            </>
          )}
        </div>
        <aside className="stack">
          <SafetyNotice />
          <Notice title="Model limits.">
            96.1% sensitivity and 95.3% specificity on scalp-EEG test data in the project report. Not yet validated on
            ear-EEG or in this population, so a flag is a reason for review, not a diagnosis.
          </Notice>
        </aside>
      </div>
    </AppShell>
  )
}
