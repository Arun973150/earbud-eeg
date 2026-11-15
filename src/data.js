// All site content, sourced from the project report
// "Earbud-based EEG Monitoring System" (MSRIT, CSP67 Mini Project, 2026)

// The landing page and the brain-health app are one React app served by Express.
export const DASHBOARD_URL = '/app'

export const STATS = [
  { value: '96.1', unit: '%', label: 'Seizure sensitivity' },
  { value: '0.971', unit: '', label: 'ROC AUC' },
  { value: '250', unit: 'Hz', label: 'In-ear sampling rate' },
  { value: '380', unit: 'ms', label: 'End-to-end latency' },
]

export const OBJECTIVES = [
  'Design a compact, comfortable earbud that captures EEG using in-ear dry electrodes.',
  'Acquire reliable signals while minimizing noise and interference.',
  'Filter, remove artifacts, and extract features from raw EEG.',
  'Detect seizures with a hybrid CNN-GRU deep-learning model.',
  'Visualize signals and results in real time through a web dashboard.',
  'Stay portable and energy-efficient for continuous everyday use.',
]

export const PIPELINE = [
  {
    title: 'Acquire',
    desc: 'Dry Ag/AgCl electrodes inside the ear canal pick up temporal-lobe activity; the BioAmp EXG Pill amplifies the low-amplitude signal.',
    meta: 'In-ear electrodes',
  },
  {
    title: 'Digitize',
    desc: 'An Arduino Uno digitizes the amplified signal and streams it over USB serial to the processing backend.',
    meta: '250 Hz · 115200 baud',
  },
  {
    title: 'Preprocess',
    desc: 'DC-offset removal, a 0.5–45 Hz Butterworth bandpass, a 50 Hz notch, and ICA artifact rejection clean the raw trace.',
    meta: 'Bandpass · Notch · ICA',
  },
  {
    title: 'Extract features',
    desc: 'Signals are windowed into 4-second segments (50% overlap); FFT, Welch PSD, line length and theta/alpha ratio are computed.',
    meta: 'FFT · PSD · θ/α',
  },
  {
    title: 'Classify',
    desc: 'A hybrid CNN-GRU model, CNN for spatial spike wave patterns, BiGRU for temporal evolution, outputs a seizure probability.',
    meta: 'CNN + BiGRU',
  },
  {
    title: 'Visualize & alert',
    desc: 'A React dashboard streams waveforms, PSD, spectrograms and probability timelines, and raises alerts above threshold.',
    meta: 'Real-time dashboard',
  },
  {
    title: 'Store',
    desc: 'EEG recordings, predictions and alert logs are persisted to MongoDB for later analysis and monitoring.',
    meta: 'MongoDB',
  },
]

export const STACK = [
  {
    title: 'Hardware',
    items: ['Dry Ag/AgCl electrodes', 'BioAmp EXG Pill', 'Arduino Uno', 'Nordic nRF52840 (BLE)', '3D-printed earbud shell'],
  },
  {
    title: 'Signal & ML',
    items: ['Python', 'NumPy', 'SciPy', 'MNE-Python', 'TensorFlow / PyTorch', 'Scikit-learn', 'CNN-GRU model'],
  },
  {
    title: 'App & Data',
    items: ['React.js', 'Flask API', 'MongoDB', 'PySerial', 'TensorFlow Lite (edge)'],
  },
]

export const METRICS = [
  { model: 'SVM baseline', sens: '95.2', spec: '91.4', f1: '0.912', auc: '0.933', proposed: false },
  { model: 'CNN-only', sens: '92.7', spec: '93.8', f1: '0.921', auc: '0.941', proposed: false },
  { model: 'LSTM-only', sens: '93.4', spec: '94.1', f1: '0.928', auc: '0.948', proposed: false },
  { model: 'CNN-GRU (ours)', sens: '96.1', spec: '95.3', f1: '0.956', auc: '0.971', proposed: true },
]

export const TEAM = [
  {
    name: 'Nishchal KJ',
    usn: '1MS23CS123',
    role: 'Team Lead & ML Engineer',
    resp: 'CNN-GRU model design, training, hyperparameter tuning, evaluation and Git repository management.',
  },
  {
    name: 'Dhruv Gupta',
    usn: '1MS23CS059',
    role: 'Hardware & Embedded Engineer',
    resp: '3D-printed earbud design, electrode integration, BioAmp + Arduino circuit assembly and firmware.',
  },
  {
    name: 'Riya Acharya',
    usn: '1MS23CS153',
    role: 'Signal Processing & Visualization Lead',
    resp: 'EEG preprocessing (filtering, ICA, windowing), feature extraction and real-time dashboard development.',
  },
  {
    name: 'Saksham Yadav',
    usn: '1MS23CS161',
    role: 'App Development & Integration',
    resp: 'Web/mobile application, serial/Bluetooth communication, system integration and interface design.',
  },
]

export const GUIDE = { name: 'Pradeep Kumar D', role: 'Assistant Professor · Project Guide' }

export const FUTURE = [
  'Wireless BLE transmission for full mobility',
  'Cloud-based storage for remote, long-term monitoring',
  'On-device edge-AI inference on low-power wearables',
  'Detection of further neurological & cognitive states',
  'Improved electrode materials & hardware miniaturization',
  'IoT and telemedicine platform integration',
  'Emergency alerts for caregivers and clinicians',
  'Neuro-adaptive, mood-based music playback',
]

// --- Landing page content: the healthcare earbud vision ---

export const VISION = {
  kicker: 'a new kind of wearable',
  statement: 'Your smartwatch reads your wrist. This reads your mind.',
  body:
    'Heart rate and step counts only hint at what is happening in the brain. Dry electrodes in an ' +
    'earbud pick up the brain\'s own electrical rhythm, with no gel, no cap and no clinic. A short ' +
    'check shows your brainwaves, screens for seizure-like activity and compares you with yourself ' +
    'over time, so meaningful change shows up early. Next: music earbuds that monitor while you listen.',
}

// Facts on the landing page. The two Lancet figures are from Livingston et al.,
// Lancet Commission on dementia prevention, 2024.
export const EVIDENCE = [
  { value: '45', unit: '%', label: 'of dementia linked to modifiable risks' },
  { value: '14', unit: '', label: 'modifiable risk factors (Lancet 2024)' },
  { value: '3', unit: 'min', label: 'for one EEG check' },
  { value: '3', unit: 'checks', label: 'to learn your personal baseline' },
]

export const CAPABILITIES = [
  { title: 'Seizure screening', desc: 'Every recording runs through our CNN-GRU seizure model, with a clear yes-or-no verdict and a second-by-second timeline.' },
  { title: 'See your brainwaves', desc: 'Your raw signal, your rhythms and a spectrogram, each explained in plain words, straight after every check.' },
  { title: 'Brain rhythm markers', desc: 'Peak alpha frequency and how your rhythm reacts when you open your eyes, early markers of slowing.' },
  { title: 'Change over time', desc: 'Three checks set your personal baseline. After that we flag only changes bigger than your normal day-to-day variation.' },
  { title: 'Speed & memory (optional)', desc: 'A longer check adds wordless games for reaction time, visual comparison and pattern memory.' },
  { title: 'Your prevention plan', desc: 'Blood pressure, sleep, mood, activity and family history become plain-language actions and the right referral.' },
]

export const STEPS = [
  { title: 'Sense', desc: 'Three minutes with the earbud in: relax with your eyes closed, then open them at the chime.' },
  { title: 'Compare', desc: 'Every result is compared with your own baseline, not a one-off score or someone else’s norms.' },
  { title: 'Act', desc: 'Clear next steps, a repeat check when something looks off, and a clinician for anything that needs a closer look.' },
]

export const SAFETY = [
  { k: 'Risk, not diagnosis', v: 'We flag change and risk. Diagnosis stays with qualified clinicians.' },
  { k: 'A clinician in the loop', v: 'You see your result straight away. Abnormal results are also sent to a clinician for a second look.' },
  { k: 'Honest about uncertainty', v: 'Every result shows your usual range, the signal quality and the known limits of each measure.' },
  { k: 'Consent for each kind of data', v: 'EEG, questionnaires, health history and genetic information each need their own consent. Data stays on the device in this prototype.' },
]

export const ACCESS = [
  { title: 'No reading needed', desc: 'Tasks use shapes, lights and tones, with every instruction available read aloud.' },
  { title: 'Bigger and clearer', desc: 'Large-text and high-contrast modes, big buttons, and full keyboard control.' },
  { title: 'Help is welcome', desc: 'A family member or health worker can sit in, and answer the daily-life questions for you.' },
]
