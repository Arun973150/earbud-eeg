import { useEffect } from 'react'
import Nav from './components/Nav.jsx'
import ParticleBrain from './components/ParticleBrain.jsx'
import { VISION, CAPABILITIES, STEPS, DASHBOARD_URL } from './data.js'

/* Reveal-on-scroll with stagger */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal')
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.14 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

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
          Brain activity,
          <br />
          made <span className="accent">wearable</span>.
        </h1>
        <p className="hero__sub">
          Wireless earbuds that play your music and quietly read your brain. Dry in ear
          electrodes bring real time seizure detection, and so much more, out of the
          hospital and into everyday life.
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

function GlyphStar() {
  return (
    <svg className="gcard__star" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
      <path className="ember" d="M12 7 L13 11 L17 12 L13 13 L12 17 L11 13 L7 12 L11 11 Z" />
    </svg>
  )
}

function Capabilities() {
  return (
    <section className="section cap-section" id="capabilities">
      <div className="cap-section__bg" aria-hidden="true" />
      <div className="container">
        <div className="section__head reveal">
          <p className="kicker">one signal, many uses</p>
          <h2 className="statement">There is so much you can do with EEG</h2>
          <p className="lead">
            Seizures are only the beginning. The same in ear stream reads stress,
            focus, sleep and attention, turning a single earbud into a window on
            the brain.
          </p>
        </div>
        <div className="gcard-grid">
          {CAPABILITIES.map((c, i) => (
            <article className="gcard reveal" key={c.title} style={{ transitionDelay: `${(i % 3) * 80}ms` }}>
              <span className="gcard__badge">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="gcard__title">{c.title}</h3>
              <span className="gcard__glyph"><GlyphStar /></span>
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
          <h2 className="statement">From ear canal to insight</h2>
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

function TryNow() {
  return (
    <section className="section try-section" id="try">
      <div className="container container--narrow reveal" style={{ textAlign: 'center' }}>
        <p className="kicker">see it in action</p>
        <h2 className="statement statement--xl">Try the live dashboard.</h2>
        <p className="lead lead--center">
          Open the EEG dashboard to run a real time analysis or upload a recording,
          then get seizure detection and visual reports in your browser.
        </p>
        <div className="try-actions">
          <a className="pill pill--solid" href={DASHBOARD_URL}>Open the dashboard</a>
        </div>
        <p className="try-note">Opens the live EEG dashboard.</p>
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
        <h2 className="statement statement--xl">Healthcare that fits in your ear.</h2>
        <div className="hero__actions" style={{ justifyContent: 'center' }}>
          <span className="hero__status"><span className="dot" /> Launching soon</span>
        </div>
      </div>
    </section>
  )
}

function FooterStarburst() {
  return (
    <svg className="starburst" width="76" height="76" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
      <path className="ember" d="M12 7 L13 11 L17 12 L13 13 L12 17 L11 13 L7 12 L11 11 Z" />
    </svg>
  )
}

function Footer() {
  return (
    <footer className="footer-c" id="footer">
      <div className="footer-c__bg" aria-hidden="true" />
      <div className="footer-c__inner reveal">
        <a className="footer-c__brand" href="#top" aria-label="Earbud EEG home">
          <FooterStarburst />
          <span className="footer-c__word">EARBUD<span className="ember">·</span>EEG</span>
        </a>

        <div className="footer-c__row">
          <span className="footer-c__corner">Bengaluru</span>
          <div className="footer-c__pills">
            <a className="pill" href="#capabilities">Explore</a>
            <a className="pill pill--accent" href="#top">Back to top</a>
          </div>
          <span className="footer-c__corner">EST. 2026</span>
        </div>

        <div className="footer-c__navwrap">
          <span className="footer-c__dot" aria-hidden="true" />
          <nav className="footer-c__links">
            <a href="#vision">Vision</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#how">How it works</a>
          </nav>
          <span className="footer-c__dot" aria-hidden="true" />
        </div>

        <div className="footer-c__copy">All rights reserved 2026 ©</div>
      </div>
    </footer>
  )
}

export default function App() {
  useReveal()
  return (
    <>
      <div className="grain" aria-hidden="true" />
      <Nav />
      <main>
        <Hero />
        <Vision />
        <Capabilities />
        <Process />
        <TryNow />
        <Closing />
      </main>
      <Footer />
    </>
  )
}
