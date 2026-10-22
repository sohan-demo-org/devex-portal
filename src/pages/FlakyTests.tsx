import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FlakyTest, FlakyTestsReport } from '../../shared/types.ts'
import { api, useApi } from '../api.ts'
import { Kpi, Loading, PageHeader } from '../components/ui.tsx'
import { fmtAgo, fmtPct } from '../util.ts'

const RANKINGS = [
  { key: 'flaky_failures', label: 'Flaky failures' },
  { key: 'reruns', label: 'Re-runs' },
  { key: 'minutes_wasted', label: 'CI minutes' },
] as const
type Ranking = (typeof RANKINGS)[number]['key']

const testKey = (t: FlakyTest) => `${t.service_id}/${t.suite}/${t.test_name}`

export function FlakyTests() {
  const [days, setDays] = useState(30)
  const [rankBy, setRankBy] = useState<Ranking>('flaky_failures')
  const [service, setService] = useState('')
  const [hideQuarantined, setHideQuarantined] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const { data, error, reload } = useApi<FlakyTestsReport>(`/api/flaky-tests?days=${days}`)

  const services = useMemo(() => [...new Set(data?.tests.map((t) => t.service_id))].sort(), [data])
  const rows = useMemo(() => (data?.tests ?? [])
    .filter((t) => (!service || t.service_id === service) && (!hideQuarantined || !t.quarantined))
    .sort((a, b) => b[rankBy] - a[rankBy] || b.flaky_failures - a.flaky_failures), [data, service, hideQuarantined, rankBy])

  const toggle = async (t: FlakyTest) => {
    setBusy(testKey(t))
    try {
      await api(`/api/flaky-tests/${t.quarantined ? 'unquarantine' : 'quarantine'}`, {
        method: 'POST',
        body: JSON.stringify({ service_id: t.service_id, suite: t.suite, test_name: t.test_name }),
      })
      reload()
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Flaky Tests"
        subtitle="Tests that failed and then passed on a re-run of the same commit. Quarantine a test to flag it for its owner while the fix lands."
        actions={
          <div className="seg" role="group" aria-label="Time window">
            {[7, 30, 90].map((d) => (
              <button key={d} className={d === days ? 'on' : ''} onClick={() => setDays(d)}>{d}d</button>
            ))}
          </div>
        }
      />
      {!data ? <Loading error={error} /> : (
        <>
          <div className="grid kpis">
            <Kpi label="Flaky tests" value={data.flaky_tests} tone={data.flaky_tests > data.quarantined ? 'warn' : 'good'} hint={`${data.quarantined} quarantined`} />
            <Kpi label="Flaky failures" value={data.flaky_failures} hint={`last ${data.window_days} days`} />
            <Kpi label="Re-runs caused" value={data.reruns} hint="re-runs of the same commit" />
            <Kpi label="CI minutes wasted" value={Math.round(data.minutes_wasted).toLocaleString()} hint={`≈ ${(data.minutes_wasted / 60).toFixed(1)} runner hours on failed attempts`} />
          </div>

          <div className="filters">
            <span className="muted small">Rank by</span>
            <div className="seg" role="group" aria-label="Rank by">
              {RANKINGS.map((r) => (
                <button key={r.key} className={r.key === rankBy ? 'on' : ''} onClick={() => setRankBy(r.key)}>{r.label}</button>
              ))}
            </div>
            <select aria-label="Service" value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">All services</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="check">
              <input type="checkbox" checked={hideQuarantined} onChange={(e) => setHideQuarantined(e.target.checked)} />
              Hide quarantined
            </label>
          </div>

          <div className="card flush">
            <table className="table flaky-table">
              <thead>
                <tr>
                  <th>#</th><th>Test</th><th>Service</th><th>Owner</th><th>Flaky failures</th><th>Re-runs</th><th>CI min wasted</th>
                  <th>{data.window_days}d failure rate</th><th>Last flaked</th><th>Latest failure</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={11} className="muted">No flaky tests in this window.</td></tr>}
                {rows.map((t, i) => (
                  <tr key={testKey(t)} className={t.quarantined ? 'is-quarantined' : ''}>
                    <td className="muted">{i + 1}</td>
                    <td className="test-cell">
                      <div className="mono">{t.test_name}{t.quarantined && <span className="tag tag-quarantined" title={t.quarantined_at ? `Quarantined ${fmtAgo(t.quarantined_at)}` : undefined}>quarantined</span>}</div>
                      <div className="muted small">{t.suite}</div>
                    </td>
                    <td><Link to={`/services/${t.service_id}`}>{t.service_id}</Link></td>
                    <td className="nowrap">{t.owner}<div className="muted small">{t.team}</div></td>
                    <td title={`${t.flaky_failures} flaky failures across ${t.flaky_commits} commits`}><strong>{t.flaky_failures}</strong></td>
                    <td>{t.reruns}</td>
                    <td>{Math.round(t.minutes_wasted).toLocaleString()}</td>
                    <td className={t.failure_rate >= 0.1 ? 'text-warn' : ''} title={`${t.failures} of ${t.executions} executions failed`}>{fmtPct(t.failure_rate)}</td>
                    <td className="muted nowrap">{fmtAgo(t.last_flaked_at)}</td>
                    <td className="text-bad small wrap failure-msg">{t.last_failure_message}</td>
                    <td>
                      <button className="btn small" disabled={busy === testKey(t)} onClick={() => toggle(t)}>
                        {t.quarantined ? 'Unquarantine' : 'Quarantine'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
