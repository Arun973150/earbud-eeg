import { useEffect, useState } from 'react'
import { DASHBOARD_URL } from '../data.js'

function Starburst() {
  // Four-pointed star cluster — Ciridae brand mark
  return (
    <svg className="starburst" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
      <path className="ember" d="M12 7 L13 11 L17 12 L13 13 L12 17 L11 13 L7 12 L11 11 Z" />
    </svg>
  )
}

const LINKS = [
  { href: '#vision', label: 'Vision' },
  { href: '#capabilities', label: 'Capabilities' },
  { href: '#how', label: 'How it works' },
]

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <a className="brand" href="#top" aria-label="Earbud EEG home">
        <Starburst />
        <span className="brand__name">EARBUD<b>·</b>EEG</span>
      </a>
      <div className="nav__links">
        <span className="nav__menu-links" style={{ display: 'contents' }}>
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </span>
        <a className="pill pill--accent" href={DASHBOARD_URL}>Try now</a>
      </div>
    </nav>
  )
}
