export function fmtDuration(s: number): string {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return m ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`
}

export function fmtAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return '—'
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function fmtPct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`
}

export function fmtMoney(x: number): string {
  return x.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: x >= 100 ? 0 : 2 })
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
