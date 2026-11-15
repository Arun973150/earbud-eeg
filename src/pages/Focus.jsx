import { useEffect, useRef, useState } from 'react'
import { AppShell, Loading, ErrorBox } from '../components/ui.jsx'
import { TaskStage } from '../check/TaskStage.jsx'
import { ReactionTask, PatternTask, MemoryTask, REACTION_TEXT, PATTERN_TEXT, MEMORY_TEXT } from '../check/tasks.jsx'
import { RestBaseline } from '../check/EegTask.jsx'
import { MoodForm, MOOD_TEXT } from '../check/forms.jsx'
import { StopDialog } from './Check.jsx'
import { navigate } from '../router.jsx'
import { api, useApi } from '../api.js'

const STEPS = {
  rest: { label: 'Relax', text: 'Keep the earbud in. Look at the dot and relax for 20 seconds.' },
  reaction: { label: 'Reaction time', text: REACTION_TEXT },
  pattern: { label: 'Same or different', text: PATTERN_TEXT },
  memory: { label: 'Pattern memory', text: MEMORY_TEXT },
  mood: { label: 'Mood', text: MOOD_TEXT },
}
const GAMES = ['reaction', 'pattern', 'memory']
const ORDER = ['rest', ...GAMES, 'mood']

// Optional add-on to a finished EEG check: three games recorded with the earbud, then four mood taps.
export default function Focus({ sid }) {
  const { data, error, loading } = useApi(`/api/sessions/${sid}`)
  const [i, setI] = useState(0)
  const [raw, setRaw] = useState({})
  const [taskJob, setTaskJob] = useState(null)
  const [stopping, setStopping] = useState(false)
  const [failure, setFailure] = useState(null)
  const marked = useRef(null)
  const order = data?.session?.eeg?.result ? ORDER : ORDER.slice(1)
  const step = data ? order[i] : 'loading'

  const mark = (label, phase) => taskJob && api.post(`/api/jobs/${taskJob}/marker`, { label, phase }).catch(() => {})

  useEffect(() => {
    if (taskJob && GAMES.includes(step) && marked.current !== step) {
      marked.current = step
      mark(step, 'start')
    }
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // After the last step: wait for the recording to be analysed, then save everything.
  useEffect(() => {
    if (step) return
    let cancelled = false
    ;(async () => {
      try {
        if (taskJob) {
          for (let n = 0; n < 120 && !cancelled; n++) {
            const { job } = await api.get(`/api/jobs/${taskJob}`)
            if (job.status !== 'running') break
            await new Promise((r) => setTimeout(r, 1000))
          }
        }
        if (cancelled) return
        await api.post(`/api/sessions/${sid}/focus`, { raw })
        navigate(`/app/s/${sid}`)
      } catch (err) {
        if (!cancelled) setFailure(err.message)
      }
    })()
    return () => { cancelled = true }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <AppShell><Loading /></AppShell>
  if (error) return <AppShell><ErrorBox error={error} /></AppShell>
  const s = data.session
  const mode = s.eeg?.result?.source === 'simulated' ? 'simulated' : s.eeg?.result ? 'earbud' : null

  const next = () => setI((n) => n + 1)
  const finishGame = (key) => {
    if (!GAMES.includes(key) || !taskJob) return
    mark(key, 'end')
    if (key === 'memory') api.post(`/api/jobs/${taskJob}/finish`).catch(() => {})
  }
  const record = (key) => (value) => {
    setRaw((r) => ({ ...r, [key]: value }))
    finishGame(key)
    next()
  }
  const skip = (key) => () => {
    finishGame(key)
    next()
  }
  const stop = async () => {
    if (taskJob) await api.del(`/api/jobs/${taskJob}`).catch(() => {})
    navigate(`/app/s/${sid}`)
  }

  if (!step) {
    return (
      <TaskStage index={order.length} total={order.length} label="Finished">
        <h2 className="task-title">{failure ? 'Couldn’t save' : 'Reading your focus…'}</h2>
        <p className="task-text" role={failure ? 'alert' : undefined}>{failure || 'Matching your brainwaves to each game. A few seconds.'}</p>
      </TaskStage>
    )
  }

  const common = { onDone: record(step), onSkip: skip(step) }
  let body
  if (stopping) body = <StopDialog onCancel={() => setStopping(false)} onConfirm={stop} />
  else if (step === 'rest') {
    body = <RestBaseline sessionId={sid} mode={mode} onDone={(jobId) => { setTaskJob(jobId); next() }} onSkip={next} />
  }
  else if (step === 'reaction') body = <ReactionTask {...common} />
  else if (step === 'pattern') body = <PatternTask {...common} />
  else if (step === 'memory') body = <MemoryTask {...common} />
  else if (step === 'mood') body = <MoodForm {...common} />

  return (
    <TaskStage
      key={step} index={i + 1} total={order.length} label={STEPS[step].label} instructions={STEPS[step].text}
      onStop={stopping ? null : () => setStopping(true)}
    >
      {body}
    </TaskStage>
  )
}
