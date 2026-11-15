import { useCallback, useEffect, useState } from 'react'

export async function request(method, url, body) {
  const isForm = body instanceof FormData
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status })
  return data
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body || {}),
  put: (url, body) => request('PUT', url, body || {}),
  del: (url) => request('DELETE', url),
}

export function useApi(url) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url) })
  const load = useCallback(async () => {
    if (!url) return
    setState((s) => ({ ...s, loading: true }))
    try {
      setState({ data: await api.get(url), error: null, loading: false })
    } catch (error) {
      setState({ data: null, error, loading: false })
    }
  }, [url])
  useEffect(() => {
    load()
  }, [load])
  return { ...state, reload: load }
}

// Polls a background job until it stops running. Returns a cancel function.
export function pollJob(jobId, onUpdate, intervalMs = 600) {
  let cancelled = false
  const tick = async () => {
    if (cancelled) return
    try {
      const { job } = await api.get(`/api/jobs/${jobId}`)
      if (cancelled) return
      onUpdate(job)
      if (job.status === 'running') setTimeout(tick, intervalMs)
    } catch (err) {
      if (!cancelled) onUpdate({ id: jobId, status: 'error', error: { code: 'NETWORK', message: err.message } })
    }
  }
  tick()
  return () => {
    cancelled = true
  }
}
