import { AppShell, PageHead, Notice } from '../components/ui.jsx'
import { TierChip } from '../components/Continuous.jsx'

const ROWS = [
  ['info', 'One lower day in background screening.', 'Told it is usually noise. Nothing to do.', 'No action.', '—'],
  ['repeat', 'A drift that sleep or activity mostly explain; a single unconfirmed decline; a noisy check.', 'Why it happened, plus “repeat after three normal nights”.', 'Not involved unless it persists.', 'Guided check within 7 days'],
  ['review', 'A sustained change that habits do not explain; a confirmed decline across checks; mood or daily-function scores above threshold.', 'Plain-language reason and “a clinician will review this”.', 'Reviews the alert, records a decision: no action, repeat, or referral (GP, neurology, geriatrics, mental health).', '7 days'],
  ['urgent', 'A sustained seizure-like event in continuous EEG; a rapid drop since the last check.', 'Safety advice and the emergency number (998 in the UAE).', 'Top of the queue; contacts the person and decides on urgent referral.', '24 hours'],
]

export default function Escalation() {
  return (
    <AppShell>
      <PageHead
        kicker="Safety"
        title="Clinical escalation pathway"
        lead="What happens when screening finds something. Every alert has a tier, a person who acts, and a deadline."
      />
      <section className="panel">
        <div className="table-wrap">
          <table className="metrics">
            <thead><tr><th className="left">Tier</th><th className="left">When</th><th className="left">The person sees</th><th className="left">The clinician</th><th className="left">Due by</th></tr></thead>
            <tbody>
              {ROWS.map(([tier, when, user, clin, due]) => (
                <tr key={tier}><td className="left"><TierChip tier={tier} /></td><td className="left">{when}</td><td className="left">{user}</td><td className="left">{clin}</td><td className="left">{due}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="stack" style={{ marginTop: 'var(--sp-24)' }}>
        <Notice title="Screening, not diagnosis.">
          Earbud·EEG flags risk and change. It never diagnoses epilepsy, dementia or any other condition; a qualified clinician decides what a result means.
        </Notice>
        <Notice title="Every step is recorded.">
          Alerts keep a history of who reviewed, escalated or closed them and when, and overdue alerts are highlighted in the clinician console.
        </Notice>
      </div>
    </AppShell>
  )
}
