import { useCallback, useEffect, useRef, useState } from 'react'
import { Intro, Ready } from './TaskStage.jsx'

const rand = (a, b) => a + Math.random() * (b - a)
const shuffle = (xs) => {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function useKeys(handler) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const onKey = (e) => ref.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function useTimers() {
  const timers = useRef([])
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])
  const later = useCallback((fn, ms) => timers.current.push(setTimeout(fn, ms)), [])
  useEffect(() => clear, [clear])
  return { later, clear }
}

/* ------------------------------------------------------------------ reaction time */

export const REACTION_TEXT =
  'When the circle lights up, press the big button, or the space bar, as fast as you can. Wait for the light: pressing early does not count.'
const REACTION_TRIALS = 20

export function ReactionTask({ onDone, onSkip }) {
  const [phase, setPhase] = useState('intro')
  const [lit, setLit] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [done, setDone] = useState(0)
  const s = useRef({ mode: 'intro', stage: 'gap', onset: 0, practiceLeft: 3, trials: [] })
  const { later, clear } = useTimers()

  const schedule = useCallback(() => {
    clear()
    setLit(false)
    s.current.stage = 'waiting'
    later(() => {
      s.current.stage = 'lit'
      s.current.onset = performance.now()
      setLit(true)
      later(() => record({ rt: null, miss: true }), 1500)
    }, rand(1000, 3000))
  }, [clear, later]) // eslint-disable-line react-hooks/exhaustive-deps

  const record = (trial) => {
    clear()
    setLit(false)
    const st = s.current
    st.stage = 'gap'
    if (st.mode === 'practice') {
      setFeedback(trial.anticipation ? 'Too early. Wait for the light.' : trial.miss ? 'Missed. Press as soon as it lights.' : `${Math.round(trial.rt)} ms`)
      if (!trial.anticipation) st.practiceLeft -= 1
      if (st.practiceLeft <= 0) {
        st.mode = 'ready'
        later(() => setPhase('ready'), 700)
        return
      }
    } else {
      st.trials.push(trial)
      const valid = st.trials.filter((t) => !t.anticipation).length
      setDone(valid)
      setFeedback(trial.anticipation ? 'Too early' : '')
      if (valid >= REACTION_TRIALS || st.trials.length >= REACTION_TRIALS + 12) {
        st.mode = 'done'
        onDone({ trials: st.trials })
        return
      }
    }
    later(schedule, 700)
  }

  const press = () => {
    const st = s.current
    if (st.mode !== 'practice' && st.mode !== 'main') return
    if (st.stage === 'waiting') record({ rt: null, anticipation: true })
    else if (st.stage === 'lit') record({ rt: performance.now() - st.onset })
  }

  useKeys((e) => {
    if (e.code === 'Space' || e.key === 'Enter') {
      if (s.current.mode === 'practice' || s.current.mode === 'main') {
        e.preventDefault()
        press()
      }
    }
  })

  const begin = (mode) => {
    s.current.mode = mode
    setPhase(mode)
    setFeedback('')
    later(schedule, 800)
  }

  if (phase === 'intro') return <Intro title="Reaction time" text={REACTION_TEXT} onStart={() => begin('practice')} onSkip={onSkip} />
  if (phase === 'ready') return <Ready text="Now 20 for real. Same thing: press as soon as the circle lights up." onStart={() => begin('main')} />
  return (
    <>
      <p className="mono muted">{phase === 'practice' ? 'Practice' : `${done} of ${REACTION_TRIALS}`}</p>
      <div className={`stim${lit ? ' is-lit' : ''}`} aria-hidden="true" />
      <p className="feedback" aria-live="polite">{feedback}</p>
      <button type="button" className="pill pill--xl" onPointerDown={(e) => { e.preventDefault(); press() }} onKeyDown={(e) => e.preventDefault()}>
        Press
      </button>
    </>
  )
}

/* ------------------------------------------------------------------ pattern comparison */

export const PATTERN_TEXT =
  'Two patterns appear side by side. If they are exactly the same, press Same. If anything is different, press Different. Go as fast as you can without guessing. Keys: F for same, J for different.'
const PATTERN_SECONDS = 45

function makePair() {
  const cells = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8])
  const a = cells.slice(0, 4)
  const same = Math.random() < 0.5
  let b = [...a]
  if (!same) {
    const empty = cells.slice(4)
    b[Math.floor(Math.random() * 4)] = empty[Math.floor(Math.random() * empty.length)]
  }
  return { a: new Set(a), b: new Set(b), same }
}

function PatternGrid({ cells, label }) {
  return (
    <div className="pgrid" role="img" aria-label={label}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={cells.has(i) ? 'on' : ''} />)}
    </div>
  )
}

export function PatternTask({ onDone, onSkip }) {
  const [phase, setPhase] = useState('intro')
  const [pair, setPair] = useState(makePair)
  const [feedback, setFeedback] = useState('')
  const [left, setLeft] = useState(PATTERN_SECONDS)
  const s = useRef({ mode: 'intro', shownAt: 0, practiceLeft: 4, trials: [], endsAt: 0, locked: false })
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const { later } = useTimers()

  const next = () => {
    setPair(makePair())
    s.current.shownAt = performance.now()
    s.current.locked = false
  }

  const finish = useCallback(() => {
    if (s.current.mode !== 'main') return
    s.current.mode = 'done'
    onDoneRef.current({ durationSec: PATTERN_SECONDS, trials: s.current.trials })
  }, [])

  useEffect(() => {
    if (phase !== 'main') return
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((s.current.endsAt - performance.now()) / 1000))
      setLeft(remaining)
      if (remaining <= 0) {
        clearInterval(id)
        finish()
      }
    }, 200)
    return () => clearInterval(id)
  }, [phase, finish])

  const answer = (same) => {
    const st = s.current
    if ((st.mode !== 'practice' && st.mode !== 'main') || st.locked) return
    const correct = same === pair.same
    const rt = performance.now() - st.shownAt
    if (st.mode === 'practice') {
      st.locked = true
      setFeedback(correct ? 'Correct' : pair.same ? 'They were the same' : 'They were different')
      st.practiceLeft -= 1
      later(() => {
        setFeedback('')
        if (st.practiceLeft <= 0) {
          st.mode = 'ready'
          setPhase('ready')
        } else next()
      }, 900)
    } else {
      st.trials.push({ correct, rt })
      next()
    }
  }

  useKeys((e) => {
    if (s.current.mode !== 'practice' && s.current.mode !== 'main') return
    if (e.key === 'f' || e.key === 'F' || e.key === 'ArrowLeft') answer(true)
    if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowRight') answer(false)
  })

  const begin = (mode) => {
    s.current.mode = mode
    if (mode === 'main') {
      s.current.endsAt = performance.now() + PATTERN_SECONDS * 1000
      setLeft(PATTERN_SECONDS)
    }
    setPhase(mode)
    next()
  }

  if (phase === 'intro') return <Intro title="Same or different?" text={PATTERN_TEXT} onStart={() => begin('practice')} onSkip={onSkip} />
  if (phase === 'ready') return <Ready text={`Now as many as you can in ${PATTERN_SECONDS} seconds.`} onStart={() => begin('main')} />
  return (
    <>
      <p className="mono muted">{phase === 'practice' ? 'Practice' : `${left} s left`}</p>
      <div className="pair">
        <PatternGrid cells={pair.a} label="Left pattern" />
        <PatternGrid cells={pair.b} label="Right pattern" />
      </div>
      <p className="feedback" aria-live="polite">{feedback}</p>
      <div className="task-actions">
        <button type="button" className="pill pill--xl" onClick={() => answer(true)}>Same</button>
        <button type="button" className="pill pill--xl" onClick={() => answer(false)}>Different</button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ pattern memory (Corsi-style) */

export const MEMORY_TEXT =
  'Tiles will light up one at a time. When they stop, tap the same tiles in the same order. The sequences get longer as you go. You can also use the number keys 1 to 9.'

export function MemoryTask({ onDone, onSkip }) {
  const [phase, setPhase] = useState('intro')
  const [litTile, setLitTile] = useState(null)
  const [tapped, setTapped] = useState(null)
  const [inputOn, setInputOn] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [length, setLength] = useState(2)
  const s = useRef({ mode: 'intro', seq: [], taps: [], length: 2, attempt: 1, trials: [] })
  const { later, clear } = useTimers()

  const present = (len) => {
    const seq = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, len)
    Object.assign(s.current, { seq, taps: [] })
    setInputOn(false)
    setFeedback('Watch')
    seq.forEach((tile, i) => {
      later(() => setLitTile(tile), 700 + i * 950)
      later(() => setLitTile(null), 700 + i * 950 + 700)
    })
    later(() => {
      setInputOn(true)
      setFeedback('Your turn')
    }, 700 + seq.length * 950)
  }

  const tap = (tile) => {
    const st = s.current
    if (!inputOn) return
    st.taps.push(tile)
    setTapped(tile)
    later(() => setTapped(null), 180)
    if (st.taps.length < st.seq.length) return
    setInputOn(false)
    const correct = st.taps.every((t, i) => t === st.seq[i])

    if (st.mode === 'practice') {
      setFeedback(correct ? 'Correct' : 'Not quite, but that was practice')
      later(() => {
        st.mode = 'ready'
        setPhase('ready')
      }, 1100)
      return
    }
    st.trials.push({ length: st.length, correct })
    setFeedback(correct ? 'Correct' : 'Not quite')
    if (correct && st.length < 9) {
      st.length += 1
      st.attempt = 1
    } else if (!correct && st.attempt === 1) {
      st.attempt = 2
    } else {
      st.mode = 'done'
      later(() => onDone({ trials: st.trials }), 900)
      return
    }
    setLength(st.length)
    later(() => present(st.length), 1300)
  }

  useKeys((e) => {
    const n = Number(e.key)
    if (n >= 1 && n <= 9) tap(n - 1)
  })

  const begin = (mode) => {
    clear()
    s.current.mode = mode
    s.current.length = mode === 'main' ? 3 : 2
    s.current.attempt = 1
    setLength(s.current.length)
    setPhase(mode)
    present(s.current.length)
  }

  if (phase === 'intro') return <Intro title="Pattern memory" text={MEMORY_TEXT} onStart={() => begin('practice')} onSkip={onSkip} />
  if (phase === 'ready') return <Ready text="Now for real. We start with 3 tiles and add one each time you get it right." onStart={() => begin('main')} />
  return (
    <>
      <p className="mono muted">{phase === 'practice' ? 'Practice' : `${length} tiles`}</p>
      <div className="mgrid">
        {Array.from({ length: 9 }, (_, i) => (
          <button
            type="button"
            key={i}
            aria-label={`Tile ${i + 1}`}
            disabled={!inputOn}
            className={litTile === i ? 'is-lit' : tapped === i ? 'is-tapped' : ''}
            onClick={() => tap(i)}
          />
        ))}
      </div>
      <p className="feedback" aria-live="polite">{feedback}</p>
    </>
  )
}

/* ------------------------------------------------------------------ hearing check */

export const HEARING_TEXT =
  'Put both earbuds in and set your volume to about half. Keep it at the same level every time you do a check. When you hear a beep, press the side you heard it on: Left or Right. Some beeps are very quiet.'

const LEVELS = [0.03, 0.008]
const FREQS = [1000, 2000, 4000]

function playTone(ctx, { freq, ear, level, duration = 0.4 }) {
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const pan = ctx.createStereoPanner()
  osc.type = 'sine'
  osc.frequency.value = freq
  pan.pan.value = ear === 'left' ? -1 : 1
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(level, t + 0.02)
  gain.gain.setValueAtTime(level, t + duration - 0.02)
  gain.gain.linearRampToValueAtTime(0, t + duration)
  osc.connect(gain).connect(pan).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + duration + 0.05)
}

export function HearingTask({ onDone, onSkip }) {
  const [phase, setPhase] = useState('intro')
  const [progress, setProgress] = useState(0)
  const ctxRef = useRef(null)
  const s = useRef({ queue: [], current: null, onset: 0, open: false, results: [], falseAlarms: 0 })
  const { later, clear } = useTimers()

  useEffect(() => () => ctxRef.current?.close(), [])

  const audio = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    return ctxRef.current
  }

  const nextTone = () => {
    const st = s.current
    st.current = st.queue.shift()
    if (!st.current) {
      setPhase('done')
      onDone({ trials: st.results, falseAlarms: st.falseAlarms })
      return
    }
    later(() => {
      playTone(audio(), st.current)
      st.onset = performance.now()
      st.open = true
      later(() => {
        if (!st.open) return
        st.open = false
        st.results.push({ ...st.current, heard: false, correctEar: false, rt: null })
        setProgress(st.results.length)
        nextTone()
      }, 2500)
    }, rand(1500, 3500))
  }

  const respond = (side) => {
    const st = s.current
    if (phase !== 'running') return
    if (!st.open) {
      st.falseAlarms += 1
      return
    }
    st.open = false
    clear()
    st.results.push({ ...st.current, heard: true, correctEar: side === st.current.ear, rt: performance.now() - st.onset })
    setProgress(st.results.length)
    nextTone()
  }

  useKeys((e) => {
    if (e.key === 'ArrowLeft') respond('left')
    if (e.key === 'ArrowRight') respond('right')
  })

  const start = () => {
    audio()
    const trials = []
    for (const freq of FREQS) for (const ear of ['left', 'right']) for (const level of LEVELS) trials.push({ freq, ear, level })
    s.current = { queue: shuffle(trials), current: null, onset: 0, open: false, results: [], falseAlarms: 0 }
    setPhase('running')
    nextTone()
  }

  const testSound = () => {
    const ctx = audio()
    playTone(ctx, { freq: 1000, ear: 'left', level: 0.12, duration: 0.5 })
    setTimeout(() => playTone(ctx, { freq: 1000, ear: 'right', level: 0.12, duration: 0.5 }), 700)
  }

  if (phase === 'intro') {
    return (
      <Intro
        title="Hearing check"
        text={HEARING_TEXT}
        startLabel="Start"
        onStart={start}
        onSkip={onSkip}
        skipLabel="Skip (no earbuds or hearing aid)"
        extra={<button type="button" className="pill" onClick={testSound}>Play a test sound (left, then right)</button>}
      />
    )
  }
  return (
    <>
      <p className="mono muted">{progress} of {FREQS.length * 2 * LEVELS.length}</p>
      <h2 className="task-title">Listen…</h2>
      <p className="task-text">Press the side you hear each beep on. It’s fine to miss the very quiet ones.</p>
      <div className="ear-pad">
        <button type="button" className="pill" onClick={() => respond('left')}>← Left</button>
        <button type="button" className="pill" onClick={() => respond('right')}>Right →</button>
      </div>
    </>
  )
}
