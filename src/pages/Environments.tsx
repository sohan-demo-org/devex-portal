import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { DevEnvironment } from '../../shared/types.ts'
import { api, useApi } from '../api.ts'
import { Kpi, Loading, PageHeader, StatusPill } from '../components/ui.tsx'
import { fmtAgo, fmtMoney } from '../util.ts'

export function Environments() {
  const { data, error, reload } = useApi<DevEnvironment[]>('/api/environments')
  const [busy, setBusy] = useState<string | null>(null)

  const act = async (env: DevEnvironment, action: 'start' | 'stop') => {
    setBusy(env.id)
    try {
      await api(`/api/environments/${env.id}/${action}`, { method: 'POST' })
      reload()
    } finally {
      setBusy(null)
    }
  }

  if (!data) return <Loading error={error} />
  const running = data.filter((e) => e.status === 'running')
  const hourly = running.reduce((a, e) => a + e.hourly_cost, 0)

  return (
    <>
      <PageHeader title="Cloud Dev Environments" subtitle="Remote workspaces provisioned for engineers, one per service checkout." />
      <div className="grid kpis">
        <Kpi label="Workspaces" value={data.length} hint={`${running.length} running`} />
        <Kpi label="Running cost" value={`${fmtMoney(hourly)}/hr`} hint={`${fmtMoney(hourly * 24 * 30)} / month at this rate`} />
        <Kpi label="vCPUs allocated" value={running.reduce((a, e) => a + e.vcpu, 0)} hint="running workspaces" />
        <Kpi label="Regions" value={new Set(data.map((e) => e.region)).size} />
      </div>
      <div className="card flush">
        <table className="table">
          <thead><tr><th>Workspace</th><th>Owner</th><th>Service</th><th>Branch</th><th>Machine</th><th>Region</th><th>IDE</th><th>Status</th><th>Last active</th><th>Cost/hr</th><th></th></tr></thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id}>
                <td className="mono">{e.name}</td>
                <td className="nowrap">{e.owner}</td>
                <td><Link to={`/services/${e.service_id}`}>{e.service_id}</Link></td>
                <td className="mono truncate">{e.branch}</td>
                <td className="nowrap">{e.machine_type} <span className="muted small">({e.vcpu} vCPU · {e.memory_gb} GB)</span></td>
                <td className="muted">{e.region}</td>
                <td className="muted nowrap">{e.ide}</td>
                <td><StatusPill status={e.status} /></td>
                <td className="muted nowrap">{fmtAgo(e.last_active_at)}</td>
                <td>{fmtMoney(e.hourly_cost)}</td>
                <td>
                  <button className="btn small" disabled={busy === e.id} onClick={() => act(e, e.status === 'running' ? 'stop' : 'start')}>
                    {e.status === 'running' ? 'Stop' : 'Start'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
