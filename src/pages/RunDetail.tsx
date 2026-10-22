import { Link, useParams } from 'react-router-dom'
import type { RunDetail } from '../../shared/types.ts'
import { useApi } from '../api.ts'
import { Loading, PageHeader, StatusPill } from '../components/ui.tsx'
import { fmtDuration, fmtTime } from '../util.ts'

export function RunDetailPage() {
  const { id } = useParams()
  const { data: run, error } = useApi<RunDetail>(`/api/runs/${id}`)
  if (!run) return <Loading error={error} />
  const total = Math.max(1, run.stages.reduce((a, s) => a + s.duration_s, 0))
  const failed = run.tests.filter((t) => t.status === 'failed').length
  const passed = run.tests.filter((t) => t.status === 'passed').length

  return (
    <>
      <PageHeader
        title={`Run #${run.id}`}
        subtitle={<><Link to={`/services/${run.service_id}`}>{run.service_id}</Link> · {run.pipeline} · <span className="mono">{run.branch}</span> · attempt {run.attempt}</>}
        actions={<StatusPill status={run.status} />}
      />
      <div className="grid kpis">
        <div className="card"><div className="kpi-label">Commit</div><div className="mono">{run.commit_sha.slice(0, 10)}</div><div className="muted small">{run.commit_message}</div></div>
        <div className="card"><div className="kpi-label">Author</div><div>{run.author}</div><div className="muted small">{run.trigger.replace('_', ' ')}</div></div>
        <div className="card"><div className="kpi-label">Timing</div><div>{fmtDuration(run.duration_s)}</div><div className="muted small">queued {fmtDuration(run.queue_s)} · {fmtTime(run.started_at)}</div></div>
        <div className="card"><div className="kpi-label">Tests</div><div>{passed} passed{failed > 0 && <span className="text-bad"> · {failed} failed</span>}</div><div className="muted small">{run.tests.length} total</div></div>
      </div>

      <div className="card">
        <div className="card-title">Stages</div>
        <div className="stagebar">
          {run.stages.map((s) => (
            <div key={s.id} className={`stage stage-${s.status}`} style={{ flexGrow: Math.max(s.duration_s, total * 0.04) }} title={`${s.name}: ${s.status} in ${fmtDuration(s.duration_s)}`}>
              <span>{s.name}</span>
              <small>{fmtDuration(s.duration_s)}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="card flush">
        <div className="card-title pad">Test results</div>
        <table className="table">
          <thead><tr><th>Status</th><th>Suite</th><th>Test</th><th>Duration</th><th>Failure</th></tr></thead>
          <tbody>
            {run.tests.map((t) => (
              <tr key={t.id}>
                <td><StatusPill status={t.status} /></td>
                <td className="muted">{t.suite}</td>
                <td className="mono">{t.test_name}</td>
                <td>{t.duration_ms ? `${(t.duration_ms / 1000).toFixed(2)}s` : '—'}</td>
                <td className="text-bad small wrap">{t.failure_message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">Log</div>
        <pre className="log">{run.log.join('\n')}</pre>
      </div>
    </>
  )
}
