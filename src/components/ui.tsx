import type { ReactNode } from 'react'

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill pill-${status}`}>{status.replace('_', ' ')}</span>
}

export function Kpi({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={`card kpi ${tone ? `kpi-${tone}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  )
}

export function Loading({ error }: { error?: string | null }) {
  return <div className="card muted">{error ? `Failed to load: ${error}` : 'Loading…'}</div>
}

export function Sparkline({ values, width = 120, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / span) * (height - 4) - 2}`).join(' ')
  return (
    <svg width={width} height={height} className="sparkline" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
