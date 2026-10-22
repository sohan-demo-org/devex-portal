import { Link } from 'react-router-dom'
import type { ServiceSummary } from '../../shared/types.ts'
import { useApi } from '../api.ts'
import { Loading, PageHeader, StatusPill } from '../components/ui.tsx'
import { fmtAgo, fmtDuration, fmtPct } from '../util.ts'

export function Services() {
  const { data, error } = useApi<ServiceSummary[]>('/api/services')
  return (
    <>
      <PageHeader title="Service Catalog" subtitle="Ownership, on-call and build health for every service." />
      {!data ? <Loading error={error} /> : (
        <div className="grid cards">
          {data.map((s) => (
            <Link key={s.id} to={`/services/${s.id}`} className="card service-card">
              <div className="row between">
                <strong>{s.name}</strong>
                <span className={`tier tier-${s.tier}`}>{s.tier}</span>
              </div>
              <div className="muted small">{s.description}</div>
              <dl className="meta">
                <dt>Team</dt><dd>{s.team}</dd>
                <dt>Owner</dt><dd>{s.owner}</dd>
                <dt>On-call</dt><dd>{s.oncall}</dd>
                <dt>Language</dt><dd>{s.language}</dd>
              </dl>
              <div className="row between small">
                <span>CI {fmtPct(s.success_rate_7d, 0)} · p95 {fmtDuration(s.p95_duration_s)}</span>
                {s.last_run_status && <StatusPill status={s.last_run_status} />}
              </div>
              <div className="muted small">Last deploy {fmtAgo(s.last_deploy_at)}</div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
