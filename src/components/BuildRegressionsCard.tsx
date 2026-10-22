import { Link } from 'react-router-dom'
import type { RegressionReport } from '../../shared/types.ts'
import { useApi } from '../api.ts'
import { fmtAgo, fmtDuration } from '../util.ts'
import { Loading } from './ui.tsx'

export function BuildRegressionsCard() {
  const { data, error } = useApi<RegressionReport>('/api/regressions')
  if (!data) return <Loading error={error} />
  const { regressions } = data

  return (
    <div className={`card regressions-card ${regressions.length ? 'has-regressions' : ''}`} data-testid="build-regressions-card">
      <div className="card-title row between">
        <span>Build regressions</span>
        <span className="muted small">
          p95 of successful runs · last {data.window_days}d vs prior {data.window_days}d · flagged above +{data.threshold_pct}%
        </span>
      </div>
      {regressions.length === 0 ? (
        <div className="muted">No build-time regressions across {data.services_checked} services.</div>
      ) : (
        <table className="table compact">
          <thead>
            <tr><th>Service</th><th>p95 build</th><th>Change</th><th>Slower stage</th><th>Suspected start</th></tr>
          </thead>
          <tbody>
            {regressions.map((r) => {
              const st = r.stages.find((s) => s.stage === r.stage)
              return (
                <tr key={r.service_id}>
                  <td><Link to={`/services/${r.service_id}`}>{r.service_name}</Link></td>
                  <td className="nowrap">{fmtDuration(r.baseline_p95_s)} → <strong>{fmtDuration(r.current_p95_s)}</strong></td>
                  <td><span className="delta-up">+{r.change_pct}%</span></td>
                  <td className="nowrap">
                    {r.stage ? <><span className="mono">{r.stage}</span>{st && <span className="muted"> +{st.change_pct}%</span>}</> : '—'}
                  </td>
                  <td className="wrap">
                    {r.suspect ? (
                      <>
                        <Link to={`/runs/${r.suspect.run_id}`}>#{r.suspect.run_id}</Link>{' '}
                        <span title={r.suspect.commit_message}>{r.suspect.commit_message}</span>
                        <div className="muted small">{r.suspect.author} · <span className="mono">{r.suspect.commit_sha.slice(0, 7)}</span> · {fmtAgo(r.suspect.started_at)}</div>
                      </>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
