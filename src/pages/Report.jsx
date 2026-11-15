import { useState } from 'react'
import { AppShell, SimTag, Loading, ErrorBox, SafetyNotice, Notice } from '../components/ui.jsx'
import { DomainCard, WellbeingCard } from '../components/Cards.jsx'
import { WaveViewer, BandBars, KeyNumbers, TaskEegPanel } from '../components/EegViz.jsx'
import { VerdictHero, ResultTiles, EegFigure, VerdictDots } from '../components/BrainResult.jsx'
import { Link } from '../router.jsx'
import { api, useApi } from '../api.js'
import { OUTCOME, FACTOR, SERVICE, reasonText, fmtDate } from '../copy.js'

function ChatPanel({ sessionId }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const send = async (e) => {
    e.preventDefault()
    const message = text.trim()
    if (!message) return
    setBusy(true)
    setError(null)
    setText('')
    const history = messages
    setMessages((m) => [...m, { role: 'user', content: message }])
    try {
      const { reply } = await api.post(`/api/sessions/${sessionId}/chat`, { message, history })
      setMessages((m) => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <section className="panel chat-panel">
      <p className="panel__eyebrow">AI explainer · can be wrong, not medical advice</p>
      <h2 className="panel__title">Ask about this result</h2>
      <div className="chat-log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.role === 'user' ? 'user' : 'ai'}`}>{m.content}</div>
        ))}
        {busy && <div className="bubble bubble--ai muted">Thinking…</div>}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <form className="chat-form" onSubmit={send}>
        <input className="input" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="For example: what is alpha?" aria-label="Your question" />
        <button className="pill pill--solid" type="submit" disabled={busy || !text.trim()}>Ask</button>
      </form>
    </section>
  )
}

function DoctorNote({ review }) {
  const text = {
    refer: `Suggested: ${review.services.map((s) => SERVICE[s] || s).join(', ')}.`,
    repeat: `Repeat the check in ${review.repeatWeeks} week${review.repeatWeeks === 1 ? '' : 's'}.`,
    no_action: 'Within normal variation. No action needed.',
  }[review.decision]
  return (
    <Notice kind="info" title={`Doctor’s note · ${fmtDate(review.decidedAt)}`}>
      {text}{review.notes ? ` “${review.notes}”` : ''}
    </Notice>
  )
}

function FocusSection({ s, pid }) {
  const ev = s.evaluation
  const hasGames = ['speed', 'memory'].some((d) => ev?.domains?.[d])
  if (!hasGames && !s.taskEeg) {
    return (
      <section className="panel focus-cta no-print">
        <div>
          <p className="panel__eyebrow">Optional · 4 minutes</p>
          <h2 className="panel__title">Add memory &amp; focus</h2>
          <p className="panel__text">Three quick games while the earbud keeps recording. Tracks memory and speed over time.</p>
        </div>
        <Link className="pill pill--solid pill--lg" to={`/app/s/${s.id}/focus`}>Start</Link>
      </section>
    )
  }
  return (
    <div className="stack stack--lg">
      {s.taskEeg && <TaskEegPanel task={s.taskEeg} />}
      {hasGames && (
        <div className="grid-3">
          {['speed', 'memory'].filter((d) => ev.domains[d]).map((d) => <DomainCard key={d} domain={d} evaluation={ev} limit={3} />)}
          <WellbeingCard evaluation={ev} />
        </div>
      )}
    </div>
  )
}

export default function Report({ sid }) {
  const { data, error, loading } = useApi(`/api/sessions/${sid}`)
  const pid = data?.participant?.id
  const history = useApi(pid ? `/api/participants/${pid}` : null)
  if (loading) return <AppShell><Loading /></AppShell>
  if (error) return <AppShell><ErrorBox error={error} /></AppShell>

  const { session: s, participant: p, risk } = data
  if (s.status !== 'completed') {
    return <AppShell><Notice title="Not finished.">This check was not completed.</Notice></AppShell>
  }
  const ev = s.evaluation
  const r = s.eeg?.result
  const present = risk.factors.filter((f) => f.status === 'present')
  const past = (history.data?.sessions || []).filter((x) => x.status === 'completed').slice(-8)

  return (
    <AppShell>
      <Link className="back no-print" to={`/app/p/${p.id}`}>← {p.nickname || p.code}</Link>

      <section className={`outcome outcome--${s.verdict?.status || 'unclear'}`}>
        <div className="outcome__glow" aria-hidden="true" />
        <div className="row">
          <p className="kicker" style={{ marginBottom: 0 }}>{fmtDate(s.completedAt)} · {p.nickname || p.code}</p>
          {(s.simulated || r?.source === 'simulated') && <SimTag />}
        </div>
        <VerdictHero verdict={s.verdict} />
        <div className="row no-print" style={{ marginTop: 'var(--sp-24)' }}>
          <Link className="pill pill--solid" to={`/app/p/${p.id}/check`}>Record again</Link>
          <button className="pill" onClick={() => window.print()}>Save as PDF</button>
          {r?.edf_file && <a className="pill pill--quiet" href={`/eeg_data/${encodeURIComponent(r.edf_file)}`} download>Download EDF</a>}
        </div>
      </section>

      <div className="stack stack--lg">
        {s.review?.status === 'completed' && <DoctorNote review={s.review} />}
        {r && <ResultTiles result={r} />}
        {r && <EegFigure result={r} />}

        {past.length > 1 && (
          <section className="panel">
            <p className="panel__eyebrow">Over time</p>
            <h2 className="panel__title">Your results so far</h2>
            <VerdictDots items={past} />
          </section>
        )}

        <FocusSection s={s} pid={p.id} />

        <details className="panel disclosure more-details">
          <summary>More details</summary>
          <div className="stack stack--lg" style={{ marginTop: 'var(--sp-20)' }}>
            {r?.waveform && <WaveViewer waveform={r.waveform} />}
            {r?.features && <BandBars closed={r.features.relative_power} open={r.features.relative_power_open} />}
            {r?.features && <KeyNumbers features={r.features} />}
            <section className="panel">
              <p className="panel__eyebrow">Compared with your own baseline</p>
              <h3 className="panel__title">{(OUTCOME[ev.outcome] || OUTCOME.stable).title}</h3>
              <ul className="bullets">{ev.reasons.map((x, i) => <li key={i}>{reasonText(x)}</li>)}</ul>
            </section>
            <section className="panel">
              <p className="panel__eyebrow">Risk context</p>
              <p className="panel__text">{present.length ? `${present.length} of 14 modifiable dementia risk factors:` : 'No modifiable risk factors recorded.'}</p>
              {present.length > 0 && <div className="factor-chips" style={{ marginTop: 'var(--sp-12)' }}>{present.map((f) => <span className="tag" key={f.id}>{FACTOR[f.id]}</span>)}</div>}
              <Link className="pill pill--quiet no-print" style={{ marginTop: 'var(--sp-12)' }} to={`/app/p/${p.id}/profile`}>Update health profile</Link>
            </section>
            {r?.quality && (
              <p className="mono muted">
                Signal {r.quality.grade} · {r.quality.kept_pct}% usable
                {typeof r.quality.fs_measured === 'number' ? ` · sampled at ${r.quality.fs_measured} Hz, resampled to 250 Hz` : ''}
                {typeof r.quality.mains_hz === 'number' ? ` · ${r.quality.mains_hz} Hz mains removed` : ''}
              </p>
            )}
            <section className="panel">
              <p className="panel__eyebrow">Accuracy and limits</p>
              <ul className="bullets">
                <li>The seizure model (CNN-GRU) scored 96.1% sensitivity and 95.3% specificity on scalp EEG. It is not yet validated on ear EEG.</li>
                <li>“Slow brain rhythm” (peak alpha under 8 Hz) is linked to memory decline, but muscle noise and drowsiness can cause it too.</li>
                <li>Change is measured against your own first three checks, not other people.</li>
              </ul>
            </section>
            {data.chat && <ChatPanel sessionId={s.id} />}
          </div>
        </details>

        <SafetyNotice />
      </div>
    </AppShell>
  )
}
