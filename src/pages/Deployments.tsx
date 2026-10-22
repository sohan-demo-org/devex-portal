import { Link } from 'react-router-dom'
import type { Deployment } from '../../shared/types.ts'
import { useApi } from '../api.ts'
import { Loading, PageHeader, StatusPill } from '../components/ui.tsx'
import { fmtTime } from '../util.ts'

export function Deployments() {
  const { data, error } = useApi<Deployment[]>('/api/deployments?limit=200')
  return (
    <>
      <PageHeader title="Deployments" subtitle="Production releases with lead time and recovery data (feeds the DORA metrics)." />
      {!data ? <Loading error={error} /> : (
        <div className="card flush">
          <table className="table">
            <thead><tr><th>Service</th><th>Version</th><th>Status</th><th>Commit</th><th>Deployed by</th><th>Lead time</th><th>Deployed</th><th>Restored</th></tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id}>
                  <td><Link to={`/services/${d.service_id}`}>{d.service_id}</Link></td>
                  <td className="mono">{d.version}</td>
                  <td><StatusPill status={d.status} /></td>
                  <td className="mono muted">{d.commit_sha.slice(0, 7)}</td>
                  <td>{d.deployed_by}</td>
                  <td>{d.lead_time_h}h</td>
                  <td className="muted nowrap">{fmtTime(d.deployed_at)}</td>
                  <td className="muted nowrap">{d.restored_at ? fmtTime(d.restored_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
