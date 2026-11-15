import { useEffect, useState } from 'react'

export function navigate(to, { replace = false } = {}) {
  if (replace) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
  if (!to.includes('#')) window.scrollTo(0, 0)
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onChange = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onChange)
    return () => window.removeEventListener('popstate', onChange)
  }, [])
  return path
}

// matchRoute('/app/p/abc', '/app/p/:pid') -> { pid: 'abc' }
export function matchRoute(path, pattern) {
  const actual = (path.replace(/\/+$/, '') || '/').split('/')
  const wanted = pattern.split('/')
  if (actual.length !== wanted.length) return null
  const params = {}
  for (let i = 0; i < wanted.length; i++) {
    if (wanted[i].startsWith(':')) params[wanted[i].slice(1)] = decodeURIComponent(actual[i])
    else if (wanted[i] !== actual[i]) return null
  }
  return params
}

export function Link({ to, onClick, ...props }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to)
      }}
      {...props}
    />
  )
}
