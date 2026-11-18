import Nav from './Nav.jsx'
import { Link } from '../router.jsx'
import { STATUS, METRIC, formatValue } from '../copy.js'

export function AppShell({ children }) {
  return (
    <>
      <div className="grain" aria-hidden="true" />
      <div className="app-glow" aria-hidden="true" />
      <Nav variant="app" />
      <main className="app-main" id="main">
        <div className="container">{children}</div>
      </main>
      <footer className="app-foot no-print">
        <span>For staff &amp; judges:</span>
        <Link to="/clinician">Clinician console</Link>
        <Link to="/validation">Validation</Link>
        <Link to="/escalation">Escalation pathway</Link>
      </footer>
    </>
  )
}

export function PageHead({ kicker, title, lead, back, children }) {
  return (
    <>
      {back && <Link className="back no-print" to={back.to}>← {back.label}</Link>}
      <header className="page-head">
        <div>
          {kicker && <p className="kicker" style={{ marginBottom: 0 }}>{kicker}</p>}
          <h1 className="statement">{title}</h1>
          {lead && <p className="lead">{lead}</p>}
        </div>
        {children && <div className="page-head__actions no-print">{children}</div>}
      </header>
    </>
  )
}

export function StatusChip({ status, label }) {
  const s = STATUS[status] || { label: status, tone: 'neutral', icon: '•' }
  return (
    <span className={`chip tone-${s.tone}`}>
      <span className="chip__icon" aria-hidden="true">{s.icon}</span>
      {label || s.label}
    </span>
  )
}

export function SimTag() {
  return <span className="sim-tag" title="Simulated demo data, not a real person">SIMULATED</span>
}

export function Notice({ kind = 'safety', title, children }) {
  return (
    <div className={`notice notice--${kind}`} role={kind === 'alert' ? 'alert' : undefined}>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  )
}

export function SafetyNotice() {
  return (
    <Notice title="Risk check, not a diagnosis.">
      Abnormal results also go to a clinician for a second look. In an emergency, call emergency services.
    </Notice>
  )
}

export function Loading({ label = 'Loading' }) {
  return <p className="loading" role="status">{label}…</p>
}

export function ErrorBox({ error }) {
  return (
    <Notice kind="alert" title="Something went wrong.">
      {error?.message || String(error)}
    </Notice>
  )
}

export function Meter({ fraction, tone = 'neutral', left, right }) {
  const width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`
  return (
    <div className="meter">
      <div className={`meter__track tone-${tone}`}>
        <div className="meter__fill" style={{ width }} />
      </div>
      {(left || right) && (
        <div className="meter__label">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </div>
  )
}

// Where today's value sits against the person's own usual range.
export function RangeBar({ id, value, low, high, status }) {
  if (status === 'pending') return null // a flagged result is explained by a clinician first
  if (typeof value !== 'number' || typeof low !== 'number' || typeof high !== 'number') return null
  low = Math.max(0, low)
  const pad = (high - low) * 0.6 || 1
  const min = Math.min(low, value) - pad
  const max = Math.max(high, value) + pad
  const x = (v) => 8 + ((v - min) / (max - min)) * 284
  const tone = STATUS[status]?.tone || 'neutral'
  const unit = METRIC[id]?.unit || ''
  return (
    <svg
      className="chart mline__range"
      viewBox="0 0 300 34"
      role="img"
      aria-label={`${METRIC[id]?.label}: ${formatValue(id, value)} ${unit}. Your usual range is ${formatValue(id, low)} to ${formatValue(id, high)}.`}
    >
      <line x1="8" x2="292" y1="12" y2="12" className="axis-line" />
      <rect x={x(low)} y="6" width={Math.max(2, x(high) - x(low))} height="12" rx="4" fill="rgba(255,255,255,0.14)" />
      <text x={x(low)} y="32" textAnchor="start">{formatValue(id, low)}</text>
      <text x={x(high)} y="32" textAnchor="end">{formatValue(id, high)}</text>
      <circle cx={x(value)} cy="12" r="6" fill={tone === 'neutral' ? 'var(--color-ash)' : `var(--status-${tone})`} stroke="#0b0b0b" strokeWidth="2" />
    </svg>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

// Pill-style radio group. options: [[value, label], ...]
export function Choices({ name, value, onChange, options, legend }) {
  return (
    <fieldset className="field">
      {legend && <legend className="field__label" style={{ marginBottom: 8 }}>{legend}</legend>}
      <div className="choices">
        {options.map(([v, label]) => (
          <label className="choice" key={String(v)}>
            <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function speak(text) {
  try {
    const synth = window.speechSynthesis
    if (!synth || !text) return
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.95
    synth.speak(u)
  } catch {
    /* speech not available in this browser */
  }
}
