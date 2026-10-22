import { useCallback, useEffect, useState } from 'react'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    if (!path) return
    let alive = true
    api<T>(path)
      .then((d) => { if (alive) { setData(d); setError(null) } })
      .catch((e: Error) => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [path, tick])

  return { data, error, reload }
}
