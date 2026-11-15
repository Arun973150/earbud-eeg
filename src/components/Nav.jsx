import { useEffect, useState } from 'react'
import GlyphStar from './GlyphStar.jsx'
import { Link, usePath } from '../router.jsx'
import { DASHBOARD_URL } from '../data.js'

const LANDING_LINKS = [
  { href: '#vision', label: 'Vision' },
  { href: '#capabilities', label: 'Capabilities' },
  { href: '#how', label: 'How it works' },
  { href: '#safety', label: 'Safety' },
]

const APP_LINKS = [
  { to: '/app', label: 'Brain check' },
  { to: '/app/screen', label: 'Upload EEG file' },
]

function readPref(key) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writePref(key, on) {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    /* storage unavailable: the setting just won't persist */
  }
}

// Large text and high contrast, remembered per browser.
function useA11yPref(key, className) {
  const [on, setOn] = useState(() => readPref(key))
  useEffect(() => {
    document.documentElement.classList.toggle(className, on)
    writePref(key, on)
  }, [on, key, className])
  return [on, setOn]
}

export default function Nav({ variant = 'landing' }) {
  const path = usePath()
  const [scrolled, setScrolled] = useState(false)
  const [large, setLarge] = useA11yPref('a11y-large', 'a11y-large')
  const [contrast, setContrast] = useA11yPref('a11y-contrast', 'a11y-contrast')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isApp = variant === 'app'
  return (
    <nav className={`nav${scrolled || isApp ? ' nav--scrolled' : ''}${isApp ? ' nav--solid no-print' : ''}`} aria-label="Main">
      <Link className="brand" to="/" aria-label="Earbud EEG home">
        <GlyphStar size={22} />
        <span className="brand__name">EARBUD<b>·</b>EEG</span>
      </Link>
      <div className="nav__links">
        <span className="nav__menu-links">
          {isApp
            ? APP_LINKS.map((l) => (
                <Link key={l.to} to={l.to} className={path === l.to || (l.to === '/app' && path.startsWith('/app/') && !path.startsWith('/app/screen')) ? 'is-active' : undefined}>
                  {l.label}
                </Link>
              ))
            : LANDING_LINKS.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}
        </span>
        {isApp && (
          <span className="nav__tools">
            <button type="button" className="nav__tool" aria-pressed={large} onClick={() => setLarge(!large)} aria-label="Larger text" title="Larger text">Aa</button>
            <button type="button" className="nav__tool" aria-pressed={contrast} onClick={() => setContrast(!contrast)} aria-label="High contrast" title="High contrast">◐</button>
          </span>
        )}
        {!isApp && <Link className="pill pill--accent" to={DASHBOARD_URL}>Try now</Link>}
      </div>
    </nav>
  )
}
