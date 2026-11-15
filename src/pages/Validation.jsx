import { useState } from 'react'
import { AppShell, PageHead, Loading, ErrorBox, Notice, Choices } from '../components/ui.jsx'
import { useApi } from '../api.js'
import { METRIC, pct, fmtDate } from '../copy.js'
import { METRICS as MODEL_METRICS } from '../data.js'

const days = (d) => (typeof d === 'number' ? `${d}` : '—')
const share = (x) => (typeof x === 'number' ? pct(x) : '—')

function Tile({ label, value, unit, sub }) {
  return (
    <div className="tile">
      <div className="tile__label">{label}</div>
      <div className="tile__value">{value}{unit && <span className="unit">{unit}</span>}</div>
      {sub && <div className="tile__sub">{sub}</div>}
    </div>
  )
}

function SegmentTable({ title, rows, minSegment }) {
  return (
    <section className="panel">
      <p className="panel__eyebrow">By {title}</p>
      <div className="table-wrap" style={{ marginTop: 'var(--sp-12)' }}>
        <table className="metrics metrics--compact">
          <thead>
            <tr>
              <th className="left">Group</th><th>People</th><th>Completion</th><th>Sensitivity</th><th>Specificity</th><th>False referrals</th><th>Days to review</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.segment}>
                <td className="left">{r.segment}</td>
                <td className="num">{r.participants}{r.insufficient ? '*' : ''}</td>
                <td className="num">{share(r.completion.rate)}</td>
                <td className="num">{share(r.detection.sensitivity)}</td>
                <td className="num">{share(r.detection.specificity)}</td>
                <td className="num">{share(r.referrals.falseReferralRate)}</td>
                <td className="num">{days(r.timeToReview.medianDays)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some((r) => r.insufficient) && <p className="field__hint" style={{ marginTop: 'var(--sp-8)' }}>* fewer than {minSegment} people: too few to compare reliably.</p>}
    </section>
  )
}

export default function Validation() {
  const [dataset, setDataset] = useState('simulated')
  const { data, error, loading } = useApi(`/api/validation?dataset=${dataset}`)
  const o = data?.overall

  return (
    <AppShell>
      <PageHead
        kicker="Validation · local population performance"
        title="Is it working, and for whom?"
        lead="Live measures of completion, repeatability, accuracy, referral burden and speed to clinical review, broken down by language, age and education."
      />
      <div className="row" style={{ marginBottom: 'var(--sp-24)' }}>
        <Choices name="dataset" value={dataset} onChange={setDataset} options={[['simulated', 'Simulated demo cohort'], ['real', 'Real participants']]} />
      </div>

      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} /> : (
        <div className="stack stack--lg" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}>
          {dataset === 'simulated' ? (
            <Notice kind="sim" title="Simulated data.">
              These people and checks are generated, not real. The generator uses the same reliability assumptions as the
              algorithm, so these numbers are optimistic. They show how each measure is calculated, not real-world accuracy.
            </Notice>
          ) : o.participants === 0 ? (
            <Notice title="No real data yet.">Measures appear here as real participants complete checks and clinicians record reviews.</Notice>
          ) : null}

          <div className="tiles">
            <Tile label="Participants" value={o.participants} sub={`${o.completion.completed} checks completed`} />
            <Tile label="Completion rate" value={share(o.completion.rate)} sub={`${o.completion.incomplete} stopped early`} />
            <Tile label="Sensitivity" value={share(o.detection.sensitivity)} sub={`${o.detection.tp} of ${o.detection.tp + o.detection.fn} with real change flagged`} />
            <Tile label="Specificity" value={share(o.detection.specificity)} sub={`${o.detection.tn} of ${o.detection.tn + o.detection.fp} without change left alone`} />
            <Tile label="Flags confirmed (PPV)" value={share(o.detection.ppv)} sub={`${o.detection.withReference} with a reference outcome`} />
            <Tile label="False-referral burden" value={share(o.referrals.falseReferralRate)} sub={`of ${o.referrals.reviews} reviews ended in no action`} />
            <Tile label="Days to clinical review" value={days(o.timeToReview.medianDays)} unit="median" sub={`${share(o.timeToReview.within7Days)} within 7 days · ${o.timeToReview.pending} pending`} />
            {dataset === 'simulated' && <Tile label="Days from onset to flag" value={days(o.detection.medianDaysToDetect)} unit="median" sub="simulated decliners" />}
          </div>

          <div className="stack">
            <SegmentTable title="first language" rows={data.segments.language} minSegment={data.minSegment} />
            <SegmentTable title="age" rows={data.segments.age} minSegment={data.minSegment} />
            <SegmentTable title="education" rows={data.segments.education} minSegment={data.minSegment} />
          </div>

          <section className="panel">
            <p className="panel__eyebrow">Test–retest reliability</p>
            <h2 className="panel__title">How repeatable each measure is</h2>
            <p className="panel__text">
              From pairs of baseline checks taken within 30 days. Once a measure has {data.minLocalPairs} or more pairs, its
              local ICC replaces the published default in the change calculation.
            </p>
            <div className="table-wrap" style={{ marginTop: 'var(--sp-12)' }}>
              <table className="metrics metrics--compact">
                <thead><tr><th className="left">Measure</th><th>Retest pairs</th><th>Local ICC(2,1)</th><th>Default r</th><th>r in use</th><th className="left">Source</th></tr></thead>
                <tbody>
                  {Object.entries(data.reliability).map(([id, r]) => (
                    <tr key={id}>
                      <td className="left">{METRIC[id]?.label || id}</td>
                      <td className="num">{r.pairs}</td>
                      <td className="num">{r.icc ?? '—'}</td>
                      <td className="num">{r.rDefault}</td>
                      <td className="num">{r.rInUse}</td>
                      <td className="left">{r.source === 'local' ? 'Local data' : 'Published default'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <p className="panel__eyebrow">Seizure model · project report</p>
            <h2 className="panel__title">CNN-GRU against baselines</h2>
            <div className="table-wrap">
              <table className="metrics metrics--compact">
                <thead><tr><th className="left">Model</th><th>Sensitivity</th><th>Specificity</th><th>F1</th><th>AUC</th></tr></thead>
                <tbody>
                  {MODEL_METRICS.map((m) => (
                    <tr key={m.model} className={m.proposed ? 'is-proposed' : ''}>
                      <td className="left">{m.model}</td><td className="num">{m.sens}%</td><td className="num">{m.spec}%</td><td className="num">{m.f1}</td><td className="num">{m.auc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field__hint" style={{ marginTop: 'var(--sp-12)' }}>
              Measured on scalp-EEG test data. Not yet validated on ear-EEG recordings or in the local population.
            </p>
          </section>

          <section className="panel">
            <p className="panel__eyebrow">Proposed local validation study</p>
            <h2 className="panel__title">How we would prove it in Abu Dhabi</h2>
            <ul className="bullets">
              <li><strong>Who:</strong> adults aged 50 and over recruited through primary care, sampled so each first-language group, age band and education band has enough people to compare.</li>
              <li><strong>Schedule:</strong> three baseline checks one week apart, then a check every three months for 12 months.</li>
              <li><strong>Reference standard:</strong> a clinician assessment, including a validated cognitive test in the person’s language, at baseline and 12 months, for everyone flagged and for a random 20% of those not flagged.</li>
              <li><strong>Measures:</strong> completion, test–retest ICC, sensitivity, specificity, PPV, ability to detect change, false-referral burden and time to clinical assessment, overall and per group.</li>
              <li><strong>Fairness check:</strong> a gap of more than 10 points between groups on any measure triggers review of the task or threshold before wider rollout.</li>
              <li><strong>Governance:</strong> research ethics approval, informed consent for each type of data, and separate consent for genetic information.</li>
            </ul>
          </section>

          <p className="mono muted">Calculated {fmtDate(data.generatedAt)}</p>
        </div>
      )}
    </AppShell>
  )
}
