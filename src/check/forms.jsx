import { useState } from 'react'
import { Choices, Field } from '../components/ui.jsx'
import { FREQUENCY, PHQ2, GAD2, FUNCTION_ITEMS, FUNCTION_OPTIONS } from '../copy.js'

const YES_NO = [[true, 'Yes'], [false, 'No']]

export const CONTEXT_TEXT = 'A few quick questions about today. Sleep, fasting and feeling unwell can all change results, so we take them into account.'

export function ContextForm({ onDone, assisted }) {
  const [c, setC] = useState({ sleepHours: '', sleepQuality: null, fasting: null, unwell: null, caffeine: null, assisted: Boolean(assisted) })
  const set = (k) => (v) => setC((x) => ({ ...x, [k]: v }))
  const ready = c.sleepHours !== '' && c.fasting !== null && c.unwell !== null
  return (
    <form
      className="stack"
      style={{ textAlign: 'left', width: 'min(760px, 100%)' }}
      onSubmit={(e) => {
        e.preventDefault()
        onDone({ ...c, sleepHours: Number(c.sleepHours) })
      }}
    >
      <h2 className="task-title" style={{ textAlign: 'center', margin: '0 auto' }}>About today</h2>
      <p className="task-text" style={{ margin: '0 auto', textAlign: 'center' }}>{CONTEXT_TEXT}</p>
      <div className="grid-2">
        <Field label="Hours of sleep last night">
          <input className="input" type="number" min={0} max={16} step={0.5} required value={c.sleepHours} onChange={(e) => set('sleepHours')(e.target.value)} autoFocus />
        </Field>
        <Choices legend="How well did you sleep?" name="sleepq" value={c.sleepQuality} onChange={set('sleepQuality')} options={[[1, 'Badly'], [3, 'OK'], [5, 'Well']]} />
        <Choices legend="Are you fasting today?" name="fasting" value={c.fasting} onChange={set('fasting')} options={YES_NO} />
        <Choices legend="Are you unwell (cold, fever, pain)?" name="unwell" value={c.unwell} onChange={set('unwell')} options={YES_NO} />
        <Choices legend="Coffee or tea in the last 2 hours?" name="caffeine" value={c.caffeine} onChange={set('caffeine')} options={YES_NO} />
        <Choices legend="Is someone helping you with this check?" name="assisted" value={c.assisted} onChange={set('assisted')} options={YES_NO} />
      </div>
      <div className="task-actions">
        <button className="pill pill--solid pill--lg" type="submit" disabled={!ready}>Continue</button>
      </div>
    </form>
  )
}

export const MOOD_TEXT = 'Over the last two weeks, how often have you been bothered by the following? There are no right or wrong answers.'

export function MoodForm({ onDone, onSkip }) {
  const [phq, setPhq] = useState([null, null])
  const [gad, setGad] = useState([null, null])
  const items = [
    ...PHQ2.map((q, i) => [`phq${i}`, q, phq[i], (v) => setPhq((a) => a.map((x, j) => (j === i ? v : x)))]),
    ...GAD2.map((q, i) => [`gad${i}`, q, gad[i], (v) => setGad((a) => a.map((x, j) => (j === i ? v : x)))]),
  ]
  const ready = [...phq, ...gad].every((x) => x !== null)
  return (
    <div className="stack" style={{ textAlign: 'left', width: 'min(760px, 100%)' }}>
      <h2 className="task-title" style={{ textAlign: 'center', margin: '0 auto' }}>How you’ve been feeling</h2>
      <p className="task-text" style={{ margin: '0 auto', textAlign: 'center' }}>{MOOD_TEXT}</p>
      {items.map(([key, question, value, onChange]) => (
        <Choices key={key} legend={question} name={key} value={value} onChange={onChange} options={FREQUENCY.map((label, i) => [i, label])} />
      ))}
      <div className="task-actions">
        <button className="pill pill--solid pill--lg" type="button" disabled={!ready} onClick={() => onDone({ phq2: phq, gad2: gad })}>Continue</button>
        <button className="pill pill--lg" type="button" onClick={onSkip}>Prefer not to answer</button>
      </div>
    </div>
  )
}

export const FUNCTION_TEXT = 'Compared with a year ago, is any of this harder than it used to be? A family member or carer can answer for you.'

export function FunctionForm({ onDone, onSkip }) {
  const [informant, setInformant] = useState('self')
  const [items, setItems] = useState({})
  const answered = FUNCTION_ITEMS.every(([k]) => k in items)
  return (
    <div className="stack" style={{ textAlign: 'left', width: 'min(760px, 100%)' }}>
      <h2 className="task-title" style={{ textAlign: 'center', margin: '0 auto' }}>Everyday tasks</h2>
      <p className="task-text" style={{ margin: '0 auto', textAlign: 'center' }}>{FUNCTION_TEXT}</p>
      <Choices legend="Who is answering?" name="informant" value={informant} onChange={setInformant} options={[['self', 'Me'], ['family', 'A family member'], ['carer', 'A carer']]} />
      {FUNCTION_ITEMS.map(([key, label]) => (
        <Choices key={key} legend={label} name={`fn-${key}`} value={key in items ? items[key] : undefined} onChange={(v) => setItems((x) => ({ ...x, [key]: v }))} options={FUNCTION_OPTIONS} />
      ))}
      <div className="task-actions">
        <button className="pill pill--solid pill--lg" type="button" disabled={!answered} onClick={() => onDone({ informant, items })}>Continue</button>
        <button className="pill pill--lg" type="button" onClick={onSkip}>Skip</button>
      </div>
    </div>
  )
}
