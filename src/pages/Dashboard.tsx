import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CiRun, DailyCi, MetricsSummary, Page, ServiceSummary } from '../../shared/types.ts'
import { useApi } from '../api.ts'
import { CiChart } from '../components/CiChart.tsx'
import { FlakyTestsKpi } from '../components/FlakyTestsKpi.tsx'
import { Kpi, Loading, PageHeader, StatusPill } from '../components/ui.tsx'
import { fmtAgo, fmtDuration, fmtMoney, fmtPct } from '../util.ts'

export function Dashboard() {
  const [days, setDays] = useState(7)
  const { data: m, error } = useApi<MetricsSummary>(`/api/metrics/summary?days=${days}`)
  const { data: daily } = useApi<DailyCi[]>('/api/metrics/ci-daily?days=30')
  const { data: services } = useApi<ServiceSummary[]>('/api/services')
  const { data: failures } = useApi<Page<CiRun>>('/api/runs?status=failed&limit=8')

  return (
    <>
      <PageHeader
        title="Engineering Overview"
        subtitle="Delivery performance, CI health and developer environment spend across all services."
        actions={
          <div className="seg" role="group" aria-label="Time window">
            {[7, 30].map((d) => (
              <button key={d} className={d === days ? 'on' : ''} onClick={() => setDays(d)}>{d}d</button>
            ))}
          </div>
        }
      />
      {!m ? <Loading error={error} /> : (
        <>
          <h2 className="section">DORA</h2>
          <div className="grid kpis">
            <Kpi label="Deployment frequency" value={`${m.deploys_per_day}/day`} hint="to production" />
            <Kpi label="Lead time for changes" value={`${m.lead_time_median_h}h`} hint="median, commit → prod" />
            <Kpi label="Change failure rate" value={fmtPct(m.change_failure_rate)} tone={m.change_failure_rate > 0.1 ? 'warn' : 'good'} hint="failed or rolled back" />
            <Kpi label="Time to restore" value={`${m.mttr_median_min}m`} hint="median" />
          </div>
          <h2 className="section">CI &amp; environments</h2>
          <div className="grid kpis">
            <Kpi label="CI success rate" value={fmtPct(m.ci_success_rate)} tone={m.ci_success_rate < 0.85 ? 'warn' : 'good'} hint={`${m.ci_runs.toLocaleString()} runs`} />
            <Kpi label="Build time p50 / p95" value={`${fmtDuration(m.build_p50_s)} / ${fmtDuration(m.build_p95_s)}`} hint="successful runs" />
            <Kpi label="Queue time" value={fmtDuration(m.queue_median_s)} hint="median wait for a runner" />
            <Kpi label="Dev environment spend" value={`${fmtMoney(m.env_cost_per_day)}/day`} hint={`${m.running_envs} running workspaces`} />
          </div>
        </>
      )}
      <FlakyTestsKpi />

      <div className="grid two">
        <div className="card">
          <div className="card-title">CI runs · last 30 days</div>
          {daily ? <CiChart days={daily} /> : <Loading />}
        </div>
        <div className="card">
          <div className="card-title">Recent failures</div>
          <table className="table compact">
            <tbody>
              {failures?.result.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/runs/${r.id}`}>#{r.id}</Link></td>
                  <td><Link to={`/services/${r.service_id}`}>{r.service_id}</Link></td>
                  <td className="truncate" title={r.commit_message}>{r.commit_message}</td>
                  <td className="muted nowrap">{fmtAgo(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Service health · last 7 days</div>
        <table className="table">
          <thead>
            <tr><th>Service</th><th>Team</th><th>Runs</th><th>Success</th><th>p95 build</th><th>Last run</th><th>Last deploy</th></tr>
          </thead>
          <tbody>
            {services?.map((s) => (
              <tr key={s.id}>
                <td><Link to={`/services/${s.id}`}>{s.name}</Link></td>
                <td className="muted">{s.team}</td>
                <td>{s.runs_7d}</td>
                <td className={s.success_rate_7d < 0.85 ? 'text-warn' : ''}>{fmtPct(s.success_rate_7d)}</td>
                <td>{fmtDuration(s.p95_duration_s)}</td>
                <td>{s.last_run_status && <StatusPill status={s.last_run_status} />}</td>
                <td className="muted">{fmtAgo(s.last_deploy_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
