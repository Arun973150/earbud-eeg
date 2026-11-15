import { useEffect } from 'react'
import { speak } from '../components/ui.jsx'

export function TaskStage({ index, total, label, instructions, autoSpeak, dim, largeStim, onStop, children }) {
  useEffect(() => {
    if (autoSpeak && instructions) speak(instructions)
  }, [autoSpeak, instructions])

  return (
    <div className={`task-stage${dim ? ' is-dim' : ''}${largeStim ? ' large-stim' : ''}`} role="region" aria-label={label}>
      <div className="task-stage__bar">
        <div className="row">
          <span className="mono">{index} / {total} · {label}</span>
          <span className="dots" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => <span key={i} className={i < index ? 'on' : ''} />)}
          </span>
        </div>
        <div className="row">
          {instructions && <button type="button" className="pill pill--quiet" onClick={() => speak(instructions)}>Read aloud</button>}
          {onStop && <button type="button" className="pill pill--quiet" onClick={onStop}>Stop</button>}
        </div>
      </div>
      <div className="task-stage__body">{children}</div>
    </div>
  )
}

export function Intro({ title, text, onStart, startLabel = 'Start practice', onSkip, skipLabel = 'Skip this part', extra }) {
  return (
    <>
      <h2 className="task-title">{title}</h2>
      <p className="task-text">{text}</p>
      {extra}
      <div className="task-actions">
        <button type="button" className="pill pill--solid pill--lg" onClick={onStart} autoFocus>{startLabel}</button>
        {onSkip && <button type="button" className="pill pill--lg" onClick={onSkip}>{skipLabel}</button>}
      </div>
    </>
  )
}

export function Ready({ title = 'Practice done', text, onStart }) {
  return (
    <>
      <h2 className="task-title">{title}</h2>
      <p className="task-text">{text}</p>
      <div className="task-actions">
        <button type="button" className="pill pill--solid pill--lg" onClick={onStart} autoFocus>Start</button>
      </div>
    </>
  )
}

// Soft two-note chime, used for cues people may not be looking at.
export function chime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    ;[660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const t = ctx.currentTime + i * 0.22
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.65)
    })
    setTimeout(() => ctx.close(), 1500)
  } catch {
    /* audio unavailable */
  }
}
