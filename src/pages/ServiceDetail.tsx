import { Link, useParams } from 'react-router-dom'
import type { CiRun, DailyCi, Deployment, Page, Service } from '../../shared/types.ts'
import { useApi } from '../api.ts'
import { CiChart } from '../components/CiChart.tsx'
import { Loading, PageHeader, StatusPill } from '../components/ui.tsx'
import { fmtAgo, fmtDuration, fmtTime } from '../util.ts'

export function ServiceDetail() {
  const { id } = useParams()
  const { data: svc, error } = useApi<Service>(`/api/services/${id}`)
  const { data: daily } = useApi<DailyCi[]>(`/api/metrics/ci-daily?days=30&service=${id}`)
  const { data: runs } = useApi<Page<CiRun>>(`/api/runs?service_id=${id}&limit=15`)
  const { data: deploys } = useApi<Deployment[]>(`/api/deployments?service_id=${id}&limit=10`)
  if (!svc) return <Loading error={error} />

  return (
    <>
      <PageHeader title={svc.name} subtitle={<>{svc.description} <span className="mono muted">{svc.repo}</span></>} actions={<span className={`tier tier-${svc.tier}`}>{svc.tier}</span>} />
      <div className="grid kpis">
        <div className="card"><div className="kpi-label">Team</div>{svc.team}</div>
        <div className="card"><div className="kpi-label">Owner</div>{svc.owner}</div>
        <div className="card"><div className="kpi-label">On-call</div>{svc.oncall}</div>
        <div className="card"><div className="kpi-label">Language</div>{svc.language}</div>
      </div>
      <div className="card">
        <div className="card-title">CI runs · last 30 days</div>
        {daily ? <CiChart days={daily} /> : <Loading />}
      </div>
      <div className="grid two">
        <div className="card flush">
          <div className="card-title pad">Recent runs</div>
          <table className="table compact">
            <tbody>
              {runs?.result.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/runs/${r.id}`}>#{r.id}</Link></td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="mono truncate">{r.branch}</td>
                  <td>{fmtDuration(r.duration_s)}</td>
                  <td className="muted nowrap">{fmtAgo(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card flush">
          <div className="card-title pad">Production deployments</div>
          <table className="table compact">
            <tbody>
              {deploys?.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.version}</td>
                  <td><StatusPill status={d.status} /></td>
                  <td className="muted">{d.deployed_by}</td>
                  <td className="muted nowrap">{fmtTime(d.deployed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
