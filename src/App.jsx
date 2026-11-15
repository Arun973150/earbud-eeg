import { useEffect } from 'react'
import { usePath, matchRoute, navigate, Link } from './router.jsx'
import Landing from './pages/Landing.jsx'
import AppHome from './pages/AppHome.jsx'
import ParticipantHome from './pages/ParticipantHome.jsx'
import Consent from './pages/Consent.jsx'
import Profile from './pages/Profile.jsx'
import Check from './pages/Check.jsx'
import Report from './pages/Report.jsx'
import Focus from './pages/Focus.jsx'
import Trends from './pages/Trends.jsx'
import Screen from './pages/Screen.jsx'
import Clinician from './pages/Clinician.jsx'
import ClinicianReview from './pages/ClinicianReview.jsx'
import Validation from './pages/Validation.jsx'
import { AppShell, PageHead } from './components/ui.jsx'

const ROUTES = [
  ['/', Landing],
  ['/app', AppHome],
  ['/app/screen', Screen],
  ['/app/p/:pid', ParticipantHome],
  ['/app/p/:pid/consent', Consent],
  ['/app/p/:pid/profile', Profile],
  ['/app/p/:pid/check', Check],
  ['/app/p/:pid/trends', Trends],
  ['/app/s/:sid', Report],
  ['/app/s/:sid/focus', Focus],
  ['/clinician', Clinician],
  ['/clinician/s/:sid', ClinicianReview],
  ['/validation', Validation],
]

function NotFound() {
  return (
    <AppShell>
      <PageHead kicker="404" title="Page not found" lead="That page doesn't exist." />
      <Link className="pill" to="/app">Go to the brain check</Link>
    </AppShell>
  )
}

export default function App() {
  const path = usePath()
  useEffect(() => {
    if (path === '/dashboard') navigate('/app', { replace: true })
  }, [path])

  for (const [pattern, Page] of ROUTES) {
    const params = matchRoute(path, pattern)
    if (params) return <Page key={path} {...params} />
  }
  return path === '/dashboard' ? null : <NotFound />
}
