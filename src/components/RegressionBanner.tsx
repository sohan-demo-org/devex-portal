import { Link } from 'react-router-dom'
import type { BuildAnalysis } from '../../shared/types.ts'
import { fmtAgo, fmtDuration, fmtTime } from '../util.ts'

export function RegressionBanner({ analysis }: { analysis: BuildAnalysis }) {
  if (!analysis.regressed) return null
  const st = analysis.stages.find((s) => s.stage === analysis.stage)
  const s = analysis.suspect
  return (
    <div className="regression-banner" role="alert" data-testid="regression-banner">
      <div className="regression-banner-icon" aria-hidden>▲</div>
      <div>
        <div className="regression-banner-title">
          Build time regression: p95 up {analysis.change_pct}% ({fmtDuration(analysis.baseline_p95_s)} → {fmtDuration(analysis.current_p95_s)})
          <span className="muted"> · last {analysis.window_days}d vs prior {analysis.window_days}d</span>
        </div>
        {st && (
          <div>
            Slower stage: <span className="mono">{st.stage}</span> p95 {fmtDuration(st.baseline_p95_s)} → {fmtDuration(st.current_p95_s)} (+{st.change_pct}%)
          </div>
        )}
        {s && (
          <div>
            Started with <Link to={`/runs/${s.run_id}`}>run #{s.run_id}</Link>: “{s.commit_message}” by {s.author}{' '}
            <span className="muted">(<span className="mono">{s.commit_sha.slice(0, 7)}</span> on <span className="mono">{s.branch}</span>, {fmtTime(s.started_at)}, {fmtAgo(s.started_at)})</span>
          </div>
        )}
      </div>
    </div>
  )
}
