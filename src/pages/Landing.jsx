import Nav from '../components/Nav.jsx'
import Footer from '../components/Footer.jsx'
import GlyphStar from '../components/GlyphStar.jsx'
import ParticleBrain from '../components/ParticleBrain.jsx'
import useReveal from '../components/useReveal.js'
import { Link } from '../router.jsx'
import { VISION, EVIDENCE, CAPABILITIES, STEPS, SAFETY, ACCESS, DASHBOARD_URL } from '../data.js'

function Hero() {
  return (
    <header className="landing" id="top">
      <div className="hero__photo" aria-hidden="true" />
      <div className="hero__brain">
        <ParticleBrain />
      </div>
      <div className="hero__veil" />

      <span className="hero__edge hero__edge--left">Out of the lab</span>
      <span className="hero__edge hero__edge--right">Into everyday life</span>

      <div className="hero__content">
        <p className="hero__manifesto">
          the comfort of an earbud, <span>the clarity of an EEG</span>
        </p>
        <h1 className="hero__display">
          Brain health,
          <br />
          protected <span className="accent">earlier</span>.
        </h1>
        <p className="hero__sub">
          An earbud-shaped EEG that reads your brain’s electrical rhythm from inside the ear. In three minutes it shows
          your brainwaves, screens for seizure-like activity and tracks meaningful change over time.
        </p>
      </div>

      <div className="hero__base">
        <span>Bengaluru · India</span>
        <span>EST. 2026</span>
      </div>
    </header>
  )
}

function Vision() {
  return (
    <section className="section section--center" id="vision">
      <div className="container container--narrow reveal">
        <p className="kicker">{VISION.kicker}</p>
        <h2 className="statement statement--xl">{VISION.statement}</h2>
        <p className="lead lead--center">{VISION.body}</p>
      </div>
    </section>
  )
}

function Evidence() {
  return (
    <section className="stats" aria-label="Key facts">
      <div className="container">
        <div className="stats__grid reveal">
          {EVIDENCE.map((s) => (
            <div className="stat" key={s.label}>
              <div className="stat__value">
                {s.value}
                {s.unit && <span className="unit"> {s.unit}</span>}
              </div>
              <div className="stat__label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Capabilities() {
  return (
    <section className="section cap-section" id="capabilities">
      <div className="cap-section__bg" aria-hidden="true" />
      <div className="container">
        <div className="section__head reveal">
          <p className="kicker">one recording, many signals</p>
          <h2 className="statement">See your brain, not just a score</h2>
          <p className="lead">
            Every check ends with your own brainwaves, explained in plain words: a seizure screen you can read at a
            glance, your brain rhythms, and how they compare with your own baseline over time.
          </p>
        </div>
        <div className="gcard-grid">
          {CAPABILITIES.map((c, i) => (
            <article className="gcard reveal" key={c.title} style={{ transitionDelay: `${(i % 3) * 80}ms` }}>
              <span className="gcard__badge">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="gcard__title">{c.title}</h3>
              <span className="gcard__glyph"><GlyphStar className="gcard__star" /></span>
              <p className="gcard__desc">{c.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function Process() {
  return (
    <section className="section" id="how">
      <div className="container">
        <div className="section__head reveal">
          <p className="kicker">how it works</p>
          <h2 className="statement">From ear canal to the right care</h2>
        </div>
        <div className="steps">
          {STEPS.map((s, i) => (
            <div className="step reveal" key={s.title} style={{ transitionDelay: `${i * 90}ms` }}>
              <span className="step__idx">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="step__title">{s.title}</h3>
              <p className="step__desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Safety() {
  return (
    <section className="section" id="safety">
      <div className="container">
        <div className="split">
          <div className="section__head reveal" style={{ marginBottom: 0 }}>
            <p className="kicker">built for safety</p>
            <h2 className="statement">A clinician stays in the loop</h2>
            <p className="lead">
              A wearable should never leave someone alone with a worrying number. The earbud identifies risk and
              change; people with the right training decide what it means.
            </p>
          </div>
          <div className="contrast reveal">
            {SAFETY.map((r) => (
              <div className="contrast__row" key={r.k}>
                <div className="k">{r.k}</div>
                <div className="v">{r.v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Access() {
  return (
    <section className="section" id="access">
      <div className="container">
        <div className="section__head reveal">
          <p className="kicker">made for everyone</p>
          <h2 className="statement">Fair across ages, languages and education</h2>
          <p className="lead">
            A one-off score can mislead when language, schooling or eyesight get in the way. Wordless tasks and a
            personal baseline keep the focus on change, and results are checked group by group.
          </p>
        </div>
        <div className="steps">
          {ACCESS.map((s, i) => (
            <div className="step reveal" key={s.title} style={{ transitionDelay: `${i * 90}ms` }}>
              <span className="step__idx">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="step__title">{s.title}</h3>
              <p className="step__desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TryNow() {
  return (
    <section className="section try-section" id="try">
      <div className="container container--narrow reveal" style={{ textAlign: 'center' }}>
        <p className="kicker">see it in action</p>
        <h2 className="statement statement--xl">Take a brain check.</h2>
        <p className="lead lead--center">
          Record three minutes with the earbud, or with a simulated signal, and see your brainwaves and seizure screen
          straight away.
        </p>
        <div className="try-actions">
          <Link className="pill pill--solid" to={DASHBOARD_URL}>Start a brain check</Link>
        </div>
        <p className="try-note">Opens the brain-health app.</p>
      </div>
    </section>
  )
}

function Closing() {
  return (
    <section className="closing" id="closing">
      <div className="closing__bg" aria-hidden="true" />
      <div className="closing__glow" />
      <div className="container container--narrow reveal">
        <p className="kicker">the future of monitoring</p>
        <h2 className="statement statement--xl">Brain care that fits in your ear.</h2>
        <div className="hero__actions" style={{ justifyContent: 'center' }}>
          <span className="hero__status"><span className="dot" /> Prototype · Population health challenge 08</span>
        </div>
      </div>
    </section>
  )
}

export default function Landing() {
  useReveal()
  return (
    <>
      <div className="grain" aria-hidden="true" />
      <Nav />
      <main>
        <Hero />
        <Vision />
        <Evidence />
        <Capabilities />
        <Process />
        <Safety />
        <Access />
        <TryNow />
        <Closing />
      </main>
      <Footer />
    </>
  )
}
