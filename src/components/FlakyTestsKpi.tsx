import { Link } from 'react-router-dom'
import type { FlakyTestsReport } from '../../shared/types.ts'
import { useApi } from '../api.ts'
import { Kpi } from './ui.tsx'

export function FlakyTestsKpi() {
  const { data } = useApi<FlakyTestsReport>('/api/flaky-tests?days=30')
  if (!data) return null
  return (
    <>
      <h2 className="section">Test reliability · last 30 days</h2>
      <div className="grid kpis">
        <Link to="/flaky-tests" className="kpi-link" aria-label="Flaky tests">
          <Kpi label="Flaky tests" value={data.flaky_tests} tone={data.flaky_tests > data.quarantined ? 'warn' : 'good'} hint={<>{data.quarantined} quarantined · <span className="link-text">View flaky tests →</span></>} />
        </Link>
        <Kpi label="Flaky failures" value={data.flaky_failures} hint="failed, then passed on re-run" />
        <Kpi label="Re-runs caused" value={data.reruns} hint="re-runs of the same commit" />
        <Kpi label="CI minutes wasted" value={Math.round(data.minutes_wasted).toLocaleString()} hint="on flaky failed attempts" />
      </div>
    </>
  )
}
