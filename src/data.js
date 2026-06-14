// All site content, sourced from the project report
// "Earbud-based EEG Monitoring System" (MSRIT, CSP67 Mini Project, 2026)

// Single server now: the marketing site and the dashboard are served by the same
// Express app, so these are same-origin relative paths.
export const APP_URL = ''
export const DASHBOARD_URL = '/dashboard'

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
    'They look and work like any wireless earbuds, so you can play your music all day. ' +
    'But heart rate and step counts only hint at what is happening inside you, and the ' +
    'brain holds the real signal, until now locked in the clinic. We build a medical ' +
    'grade EEG sensor into the earbuds you already wear, so the most important data you ' +
    'have finally goes where you go.',
}

export const CAPABILITIES = [
  { title: 'Seizure detection', desc: 'Catch focal onset seizures the moment they emerge and alert the people who matter.' },
  { title: 'Stress & calm', desc: 'Read the balance between tension and relaxation, continuously and unobtrusively.' },
  { title: 'Focus & load', desc: 'Measure attention and cognitive load to protect deep work and flag burnout early.' },
  { title: 'Sleep staging', desc: 'Track a full night of sleep from a single comfortable in ear sensor.' },
  { title: 'Auditory attention', desc: 'Know what the brain is actually listening to, the basis for smarter hearing.' },
  { title: 'Mood adaptive sound', desc: 'Let playback respond to your brain state, not just your playlist.' },
]

export const STEPS = [
  { title: 'Sense', desc: 'Dry electrodes inside the ear pick up temporal lobe activity. No gel, no cap, no clinic.' },
  { title: 'Understand', desc: 'Real time analysis reads the stream on the fly, separating signal from noise.' },
  { title: 'Respond', desc: 'Insights, alerts and adaptive audio, the brain finally acting on its own data.' },
]
