import type { EnvironmentUsageReport } from '../../shared/types.ts'
import { fmtMoney } from '../util.ts'

interface Props {
  report: EnvironmentUsageReport
  busy: boolean
  showingIdle: boolean
  onShowIdle: () => void
  onHibernateAll: () => void
}

export function IdleBanner({ report, busy, showingIdle, onShowIdle, onHibernateAll }: Props) {
  const n = report.idle_count
  if (n === 0) {
    return (
      <div className="card idle-banner idle-banner-ok" data-testid="idle-banner">
        <div>
          <div className="idle-banner-title">No idle workspaces</div>
          <div className="muted small">Every running workspace has had activity in the last {report.idle_threshold_hours} hours.</div>
        </div>
      </div>
    )
  }
  return (
    <div className="card idle-banner" role="status" data-testid="idle-banner">
      <div>
        <div className="idle-banner-title">
          {n} idle workspace{n === 1 ? '' : 's'} wasting {fmtMoney(report.idle_cost_per_day)}/day
        </div>
        <div className="muted small">
          Running with no activity for more than {report.idle_threshold_hours}h · {fmtMoney(report.idle_hourly_cost)}/hr ·{' '}
          {fmtMoney(report.wasted_spend_total)} spent while idle so far. Hibernating releases compute ($0/hr) and keeps the disk.
        </div>
      </div>
      <div className="row">
        {!showingIdle && <button className="btn" onClick={onShowIdle}>Show idle</button>}
        <button className="btn btn-primary" disabled={busy} onClick={onHibernateAll}>
          {busy ? 'Hibernating…' : `Hibernate all idle (${n})`}
        </button>
      </div>
    </div>
  )
}
