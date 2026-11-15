// Every participant-facing string the server refers to by key lives here, so the
// wording can be reviewed in one place (and translated later).

export const METRIC = {
  rt_median_ms: { label: 'Reaction time', unit: 'ms', better: 'lower', about: 'How quickly you respond to a light. Lower is faster.' },
  rt_cv: { label: 'Reaction consistency', unit: '', better: 'lower', about: 'How much your reaction times vary. Lower is steadier.' },
  pattern_correct_per_min: { label: 'Pattern comparison', unit: '/min', better: 'higher', about: 'Correct same-or-different answers per minute.' },
  memory_span: { label: 'Pattern memory', unit: 'tiles', better: 'higher', about: 'The longest sequence of tiles you repeated correctly.' },
  paf_hz: { label: 'Peak alpha frequency', unit: 'Hz', better: 'higher', about: 'The speed of your brain\'s main resting rhythm. Slowing can be an early sign of change.' },
  theta_alpha_ratio: { label: 'Theta / alpha balance', unit: '', better: 'lower', about: 'Slow (theta) versus relaxed (alpha) rhythm with eyes closed. A rise can mean slowing.' },
  alpha_reactivity: { label: 'Alpha reactivity', unit: '×', better: 'higher', about: 'How much your alpha rhythm drops when you open your eyes.' },
  hearing_misses: { label: 'Missed tones', unit: '', better: 'lower', about: 'Quiet tones you didn\'t hear, out of 12.' },
}

export const DOMAIN = {
  speed: { label: 'Processing speed', inline: 'processing speed', metrics: ['rt_median_ms', 'rt_cv', 'pattern_correct_per_min'] },
  memory: { label: 'Memory', inline: 'memory', metrics: ['memory_span'] },
  rhythm: { label: 'Brain rhythm (EEG)', inline: 'brain rhythm (EEG)', metrics: ['paf_hz', 'theta_alpha_ratio', 'alpha_reactivity'] },
  hearing: { label: 'Hearing', inline: 'hearing', metrics: ['hearing_misses'] },
}

export const STATUS = {
  ok: { label: 'Usual range', tone: 'good', icon: '✓' },
  improved: { label: 'Better than usual', tone: 'good', icon: '✓' },
  watch: { label: 'Slightly off', tone: 'warning', icon: '△' },
  decline: { label: 'Below usual', tone: 'critical', icon: '!' },
  baseline: { label: 'Building baseline', tone: 'neutral', icon: '○' },
  pending: { label: 'With clinician', tone: 'neutral', icon: '…' },
  excluded: { label: 'Not used', tone: 'neutral', icon: '–' },
  // session outcomes
  stable: { label: 'Steady', tone: 'good', icon: '✓' },
  repeat: { label: 'Repeat soon', tone: 'warning', icon: '△' },
  review: { label: 'Changed', tone: 'serious', icon: '◆' },
  urgent: { label: 'Urgent', tone: 'critical', icon: '!' },
  abandoned: { label: 'Stopped early', tone: 'neutral', icon: '–' },
  in_progress: { label: 'In progress', tone: 'neutral', icon: '…' },
}

export const OUTCOME = {
  baseline: {
    title: 'Building your baseline',
    body: 'We need three checks to learn what is normal for you. After that, every check is compared with your own baseline.',
  },
  stable: {
    title: 'Steady',
    body: 'Nothing has changed beyond your normal day-to-day variation. Keep doing what you are doing.',
  },
  repeat: {
    title: 'Let’s check again soon',
    body: 'Something was a little different this time. One-off differences are common (a short night, stress, fasting), so a repeat check will tell us whether it was real.',
  },
  pending: {
    title: 'A clinician is reviewing your results',
    body: 'Some results changed more than everyday variation. A qualified clinician will look at them and contact you about next steps. This is not a diagnosis.',
  },
  pending_urgent: {
    title: 'A clinician has been alerted',
    body: 'One result needs prompt attention, so a clinician has been asked to review it as a priority. If you feel unwell, or have a seizure, contact emergency services.',
  },
  review: {
    title: 'Changed more than usual',
    body: 'Some results moved further than your everyday variation. Show this report to a doctor.',
  },
  urgent: {
    title: 'Needs prompt attention',
    body: 'Show this report to a doctor soon. If you feel unwell or have a seizure, contact emergency services.',
  },
}

const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)
const domains = (ds = []) => list(ds.map((d) => DOMAIN[d]?.inline || d))
const metrics = (ms = []) => list(ms.map((m) => METRIC[m]?.label.toLowerCase() || m))
const CONFOUNDER = { fasting: 'fasting', unwell: 'feeling unwell', short_sleep: 'short on sleep' }

export function reasonText({ key, params = {} }) {
  switch (key) {
    case 'baseline_building': return `${Math.min(params.done, params.needed)} of ${params.needed} baseline checks done.`
    case 'all_within_range': return 'Every result was within your usual range.'
    case 'single_decline': return `${capital(metrics(params.metrics))} was below your usual range this time.`
    case 'several_watch': return `${params.count} results were slightly outside your usual range.`
    case 'confirmed_decline': return `${capital(metrics(params.metrics))} was below your usual range on two checks in a row.`
    case 'multi_domain_decline': return `Results in ${domains(params.domains)} were below your usual range in the same check.`
    case 'rapid_change': return `Large drop since your last check in ${domains(params.domains)}.`
    case 'seizure_screen': return `The seizure screen found a sustained stretch of seizure-like activity (peak ${pct(params.probability)}).`
    case 'function_change': return `New difficulties with everyday tasks (score ${params.score} of 16).`
    case 'mood_phq2': return `Mood questions scored ${params.score} of 6. A score of 3 or more is worth talking about.`
    case 'anxiety_gad2': return `Worry questions scored ${params.score} of 6. A score of 3 or more is worth talking about.`
    case 'eeg_poor': return 'The EEG signal quality was poor, so brain-rhythm results were not used.'
    case 'hearing_misses': return `You missed ${params.misses} tones in your ${params.ear} ear.`
    case 'confounded': return `You were ${list(params.factors.map((f) => CONFOUNDER[f] || f))} today, which can affect results.`
    case 'pending_review': return params.urgent ? 'Your results are with a clinician as a priority.' : 'Your results are with a clinician for review.'
    default: return key
  }
}

export const SERVICE = {
  primary_care: 'Primary care (family doctor)',
  neurology: 'Neurology',
  geriatrics: 'Geriatric medicine',
  mental_health: 'Mental health services',
  audiology: 'Audiology (hearing test)',
  sleep_clinic: 'Sleep clinic',
}

export const RECOMMENDATION = {
  retest_rested: { title: 'Repeat when rested', body: 'Take your next check after a normal night’s sleep, when you are not fasting or unwell.', source: 'Check protocol' },
  hearing_test: { title: 'Get a hearing test', body: 'Hearing loss is one of the biggest modifiable risks for dementia. Treating it, for example with hearing aids, protects the brain.', source: 'Lancet Commission 2024' },
  mood: { title: 'Talk to someone about your mood', body: 'Low mood and worry are common and treatable. A doctor or counsellor can help.', source: 'PHQ-2 / GAD-2 screening' },
  sleep: { title: 'Protect your sleep', body: 'Aim for 7–8 hours with a regular bedtime, and limit screens and caffeine late in the day. Loud snoring is worth getting checked.', source: 'Sleep health guidance' },
  blood_pressure: { title: 'Keep blood pressure in range', body: 'From age 40, aim for a top (systolic) number of 130 or below. Ask your family doctor how to get there.', source: 'Lancet Commission 2024' },
  ldl: { title: 'Check your cholesterol', body: 'High LDL cholesterol is linked to dementia risk. A blood test and treatment can lower it.', source: 'Lancet Commission 2024' },
  diabetes: { title: 'Keep blood sugar steady', body: 'Well-managed diabetes protects the brain as well as the heart. Keep up regular reviews.', source: 'Lancet Commission 2024' },
  activity: { title: 'Move more', body: 'Aim for 150 minutes of moderate activity a week. In hot months, walk early in the morning or indoors.', source: 'WHO activity guidelines' },
  weight: { title: 'Work toward a healthy weight', body: 'A BMI of 30 or more adds to brain-health risk. Small, steady changes in diet and activity help.', source: 'Lancet Commission 2024' },
  smoking: { title: 'Stop smoking', body: 'Stopping at any age lowers risk. Ask your doctor about quit support.', source: 'Lancet Commission 2024' },
  alcohol: { title: 'Cut down on alcohol', body: 'More than 21 units a week is linked to higher dementia risk.', source: 'Lancet Commission 2024' },
  social: { title: 'Stay connected', body: 'Regular contact with family, friends or community groups is good for the brain.', source: 'Lancet Commission 2024' },
  vision: { title: 'Get your eyes checked', body: 'Untreated vision loss is a modifiable risk. Glasses or cataract treatment can help.', source: 'Lancet Commission 2024' },
  head_protection: { title: 'Protect your head', body: 'Wear a seatbelt, and a helmet when cycling or riding. Head injuries add risk.', source: 'Lancet Commission 2024' },
  learning: { title: 'Keep learning', body: 'New skills, languages and hobbies build brain reserve at any age.', source: 'Lancet Commission 2024' },
  air: { title: 'Limit smoke and dust', body: 'On poor air-quality days, stay indoors with windows closed where you can.', source: 'Lancet Commission 2024' },
  keep_going: { title: 'Keep doing what you are doing', body: 'Stay active, sleep well, stay social, and keep up your regular checks.', source: 'Lancet Commission 2024' },
}

export const FACTOR = {
  less_education: 'Fewer years of education',
  hearing_loss: 'Hearing loss',
  high_ldl: 'High LDL cholesterol',
  depression: 'Depression',
  head_injury: 'Head injury',
  physical_inactivity: 'Physical inactivity',
  diabetes: 'Diabetes',
  smoking: 'Smoking',
  hypertension: 'High blood pressure',
  obesity: 'Obesity (BMI 30+)',
  excess_alcohol: 'Heavy drinking',
  social_isolation: 'Social isolation',
  air_pollution: 'Air pollution',
  vision_loss: 'Untreated vision loss',
}

export const FREQUENCY = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day']
export const PHQ2 = ['Little interest or pleasure in doing things', 'Feeling down, depressed or hopeless']
export const GAD2 = ['Feeling nervous, anxious or on edge', 'Not being able to stop or control worrying']

export const FUNCTION_ITEMS = [
  ['phone', 'Using the phone'],
  ['shopping', 'Shopping'],
  ['meals', 'Preparing meals'],
  ['housework', 'Housework'],
  ['transport', 'Getting around or driving'],
  ['medicines', 'Taking medicines correctly'],
  ['money', 'Handling money and bills'],
  ['appointments', 'Remembering appointments and recent events'],
]
export const FUNCTION_OPTIONS = [
  [0, 'No change'],
  [1, 'A little harder'],
  [2, 'Much harder'],
  [null, 'Doesn’t apply'],
]

export const ABANDON_REASONS = [
  ['too_long', 'It’s taking too long'],
  ['hard_to_understand', 'Hard to understand'],
  ['technical', 'Something isn’t working'],
  ['unwell', 'I don’t feel well'],
  ['other', 'Another reason'],
]

export const LANGUAGES = ['Arabic', 'English', 'Hindi', 'Urdu', 'Malayalam', 'Tagalog', 'Bengali', 'Persian']

export function pct(x) {
  if (typeof x !== 'number') return '—'
  return x > 0 && x < 0.01 ? `${(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`
}

export function capital(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

export function formatValue(id, value) {
  if (typeof value !== 'number') return '—'
  const decimals = { rt_median_ms: 0, rt_cv: 2, pattern_correct_per_min: 1, memory_span: 0, paf_hz: 1, theta_alpha_ratio: 2, alpha_reactivity: 1, hearing_misses: 0 }[id] ?? 1
  return value.toFixed(decimals)
}

export function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
}

export function daysFromNow(iso) {
  if (!iso) return null
  return Math.round((Date.parse(iso) - Date.now()) / 86400000)
}
