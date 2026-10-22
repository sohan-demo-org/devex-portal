import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { EnvironmentUsage, EnvironmentUsageReport, HibernateIdleResult } from '../../shared/types.ts'
import { api, useApi } from '../api.ts'
import { fmtIdle } from '../components/fmtIdle.ts'
import { IdleBanner } from '../components/IdleBanner.tsx'
import { Kpi, Loading, PageHeader, StatusPill } from '../components/ui.tsx'
import { fmtAgo, fmtMoney } from '../util.ts'

type Action = 'start' | 'stop' | 'hibernate'

const FILTERS = [
  { key: '', label: 'All', match: () => true },
  { key: 'idle', label: 'Idle', match: (e: EnvironmentUsage) => e.idle },
  { key: 'running', label: 'Running', match: (e: EnvironmentUsage) => e.status === 'running' },
  { key: 'hibernated', label: 'Hibernated', match: (e: EnvironmentUsage) => e.status === 'hibernated' },
  { key: 'stopped', label: 'Stopped', match: (e: EnvironmentUsage) => e.status === 'stopped' },
] as const

const SORTS: Record<string, { label: string; cmp?: (a: EnvironmentUsage, b: EnvironmentUsage) => number }> = {
  '': { label: 'Default (status, owner)' },
  idle: { label: 'Idle time (longest first)', cmp: (a, b) => b.idle_hours - a.idle_hours },
  wasted: { label: 'Wasted spend (highest first)', cmp: (a, b) => b.wasted_spend - a.wasted_spend },
  cost: { label: 'Cost/hr (highest first)', cmp: (a, b) => b.hourly_cost - a.hourly_cost },
  active: { label: 'Last active (oldest first)', cmp: (a, b) => Date.parse(a.last_active_at) - Date.parse(b.last_active_at) },
}

const effectiveCost = (e: EnvironmentUsage) => (e.status === 'running' ? e.hourly_cost : 0)

export function Environments() {
  const { data, error, reload } = useApi<EnvironmentUsageReport>('/api/environments/usage')
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const filter = FILTERS.find((f) => f.key === (params.get('filter') ?? '')) ?? FILTERS[0]
  const sortKey = params.get('sort') ?? ''
  const sort = SORTS[sortKey] ?? SORTS['']

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  const act = async (env: EnvironmentUsage, action: Action) => {
    setBusy(env.id)
    setNotice(null)
    try {
      await api(`/api/environments/${env.id}/${action}`, { method: 'POST' })
      if (action === 'hibernate') setNotice(`Hibernated ${env.name} — saving ${fmtMoney(env.hourly_cost * 24)}/day.`)
      if (action === 'start' && env.status === 'hibernated') setNotice(`Resumed ${env.name}.`)
      reload()
    } catch (e) {
      setNotice(`Failed to ${action} ${env.name}: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const hibernateAll = async () => {
    setBusy('*')
    setNotice(null)
    try {
      const r = await api<HibernateIdleResult>('/api/environments/hibernate-idle', { method: 'POST' })
      setNotice(`Hibernated ${r.count} idle workspace${r.count === 1 ? '' : 's'} — saving ${fmtMoney(r.daily_savings)}/day.`)
      reload()
    } catch (e) {
      setNotice(`Failed to hibernate idle workspaces: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  if (!data) return <Loading error={error} />
  const envs = data.environments
  const running = envs.filter((e) => e.status === 'running')
  const hibernated = envs.filter((e) => e.status === 'hibernated')
  const hourly = envs.reduce((a, e) => a + effectiveCost(e), 0)
  const rows = envs.filter(filter.match)
  if (sort.cmp) rows.sort(sort.cmp)

  return (
    <>
      <PageHeader title="Cloud Dev Environments" subtitle="Remote workspaces provisioned for engineers, one per service checkout." />
      <IdleBanner
        report={data}
        busy={busy === '*'}
        showingIdle={filter.key === 'idle'}
        onShowIdle={() => setParams(new URLSearchParams({ filter: 'idle', sort: 'wasted' }))}
        onHibernateAll={hibernateAll}
      />
      {notice && <div className="card notice" role="status">{notice}</div>}
      <div className="grid kpis">
        <Kpi label="Workspaces" value={envs.length} hint={`${running.length} running · ${data.idle_count} idle · ${hibernated.length} hibernated`} />
        <Kpi label="Running cost" value={`${fmtMoney(hourly)}/hr`} hint={`${fmtMoney(hourly * 24 * 30)} / month at this rate`} />
        <Kpi
          label="Idle waste"
          value={`${fmtMoney(data.idle_cost_per_day)}/day`}
          hint={`${fmtMoney(data.wasted_spend_total)} spent idle so far`}
          tone={data.idle_count ? 'bad' : 'good'}
        />
        <Kpi label="vCPUs allocated" value={running.reduce((a, e) => a + e.vcpu, 0)} hint="running workspaces" />
      </div>
      <div className="filters">
        <div className="seg" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.key} className={f.key === filter.key ? 'on' : ''} onClick={() => set('filter', f.key)}>
              {f.label} <span className="seg-count">{envs.filter(f.match).length}</span>
            </button>
          ))}
        </div>
        <select value={sortKey in SORTS ? sortKey : ''} onChange={(e) => set('sort', e.target.value)} aria-label="Sort">
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>Sort: {s.label}</option>)}
        </select>
        <span className="muted">{rows.length} workspace{rows.length === 1 ? '' : 's'}</span>
      </div>
      <div className="card flush">
        <table className="table">
          <thead>
            <tr>
              <th>Workspace</th><th>Owner</th><th>Branch</th><th>Machine</th>
              <th>Status</th><th>Last active</th><th>Wasted</th><th>Cost/hr</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={9} className="muted">No workspaces match this filter.</td></tr>}
            {rows.map((e) => (
              <tr key={e.id} className={e.idle ? 'row-idle' : undefined} data-testid={`env-${e.id}`}>
                <td className="mono">{e.name.split('/')[0]}/<Link to={`/services/${e.service_id}`}>{e.service_id}</Link></td>
                <td className="nowrap">{e.owner}</td>
                <td className="mono truncate env-branch" title={e.branch}>{e.branch}</td>
                <td className="nowrap" title={`${e.vcpu} vCPU · ${e.memory_gb} GB · ${e.region} · ${e.ide}`}>
                  {e.machine_type}
                </td>
                <td className="nowrap">
                  <StatusPill status={e.idle ? 'idle' : e.status} />
                  {e.idle && <span className="text-warn small idle-for"> for {fmtIdle(e.idle_hours)}</span>}
                </td>
                <td className="muted nowrap">{fmtAgo(e.last_active_at)}</td>
                <td className={e.idle ? 'text-bad nowrap' : 'muted'}>{e.idle ? fmtMoney(e.wasted_spend) : '—'}</td>
                <td className="nowrap">
                  {e.status === 'hibernated'
                    ? <>{fmtMoney(0)} <span className="muted small" title="Compute released; disk kept">(was {fmtMoney(e.hourly_cost)})</span></>
                    : fmtMoney(e.hourly_cost)}
                </td>
                <td className="nowrap">
                  <RowActions env={e} disabled={busy !== null} onAct={act} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function RowActions({ env, disabled, onAct }: { env: EnvironmentUsage; disabled: boolean; onAct: (env: EnvironmentUsage, action: Action) => void }) {
  if (env.status === 'running') {
    return (
      <div className="row">
        <button className="btn small" disabled={disabled} onClick={() => onAct(env, 'hibernate')} title="Release compute, keep the disk">Hibernate</button>
        <button className="btn small" disabled={disabled} onClick={() => onAct(env, 'stop')}>Stop</button>
      </div>
    )
  }
  if (env.status === 'hibernated') {
    return <button className="btn small" disabled={disabled} onClick={() => onAct(env, 'start')}>Resume</button>
  }
  return <button className="btn small" disabled={disabled} onClick={() => onAct(env, 'start')}>Start</button>
}
