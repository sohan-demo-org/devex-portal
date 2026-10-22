import { Link, useSearchParams } from 'react-router-dom'
import type { CiRun, Page, ServiceSummary } from '../../shared/types.ts'
import { useApi } from '../api.ts'
import { Loading, PageHeader, StatusPill } from '../components/ui.tsx'
import { fmtAgo, fmtDuration } from '../util.ts'

const PAGE = 50

export function Runs() {
  const [params, setParams] = useSearchParams()
  const offset = Number(params.get('offset') ?? 0)
  const qs = new URLSearchParams(params)
  qs.set('limit', String(PAGE))
  const { data, error } = useApi<Page<CiRun>>(`/api/runs?${qs}`)
  const { data: services } = useApi<ServiceSummary[]>('/api/services')

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('offset')
    setParams(next)
  }

  return (
    <>
      <PageHeader title="CI Runs" subtitle="Every pipeline run across the monorepo fleet. Click a run for stages, tests and logs." />
      <div className="filters">
        <select value={params.get('service_id') ?? ''} onChange={(e) => set('service_id', e.target.value)} aria-label="Service">
          <option value="">All services</option>
          {services?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={params.get('status') ?? ''} onChange={(e) => set('status', e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          {['success', 'failed', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={params.get('branch') ?? ''} onChange={(e) => set('branch', e.target.value)} aria-label="Branch">
          <option value="">All branches</option>
          <option value="main">main</option>
        </select>
        <input placeholder="Search commit, SHA or branch…" defaultValue={params.get('q') ?? ''} onKeyDown={(e) => { if (e.key === 'Enter') set('q', e.currentTarget.value) }} />
        {data && <span className="muted">{data.total.toLocaleString()} runs</span>}
      </div>
      {!data ? <Loading error={error} /> : (
        <div className="card flush">
          <table className="table">
            <thead>
              <tr><th>Run</th><th>Status</th><th>Service</th><th>Branch</th><th>Commit</th><th>Author</th><th>Queue</th><th>Duration</th><th>Started</th></tr>
            </thead>
            <tbody>
              {data.result.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/runs/${r.id}`}>#{r.id}</Link>{r.attempt > 1 && <span className="tag" title="Re-run of the same commit">retry {r.attempt}</span>}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td><Link to={`/services/${r.service_id}`}>{r.service_id}</Link></td>
                  <td className="mono">{r.branch}</td>
                  <td className="truncate" title={r.commit_message}><span className="mono muted">{r.commit_sha.slice(0, 7)}</span> {r.commit_message}</td>
                  <td className="nowrap">{r.author}</td>
                  <td>{fmtDuration(r.queue_s)}</td>
                  <td>{fmtDuration(r.duration_s)}</td>
                  <td className="muted nowrap">{fmtAgo(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <button disabled={offset === 0} onClick={() => setParams((p) => { p.set('offset', String(Math.max(0, offset - PAGE))); return p })}>← Newer</button>
            <span className="muted">{offset + 1}–{Math.min(offset + PAGE, data.total)} of {data.total}</span>
            <button disabled={offset + PAGE >= data.total} onClick={() => setParams((p) => { p.set('offset', String(offset + PAGE)); return p })}>Older →</button>
          </div>
        </div>
      )}
    </>
  )
}
