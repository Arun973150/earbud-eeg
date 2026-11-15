import GlyphStar from './GlyphStar.jsx'
import { Link } from '../router.jsx'

export default function Footer() {
  return (
    <footer className="footer-c" id="footer">
      <div className="footer-c__bg" aria-hidden="true" />
      <div className="footer-c__inner reveal">
        <a className="footer-c__brand" href="#top" aria-label="Earbud EEG home">
          <GlyphStar size={76} />
          <span className="footer-c__word">EARBUD<span className="ember">·</span>EEG</span>
        </a>

        <div className="footer-c__row">
          <span className="footer-c__corner">Bengaluru</span>
          <div className="footer-c__pills">
            <Link className="pill" to="/app">Brain check</Link>
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
            <a href="#safety">Safety</a>
            <Link to="/clinician">Clinician</Link>
            <Link to="/validation">Validation</Link>
          </nav>
          <span className="footer-c__dot" aria-hidden="true" />
        </div>

        <div className="footer-c__copy">All rights reserved 2026 ©</div>
      </div>
    </footer>
  )
}
