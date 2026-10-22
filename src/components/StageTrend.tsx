import type { ServiceBuildTrend } from '../../shared/types.ts'
import { fmtDuration } from '../util.ts'

function TrendLine({ values, markIndex, width = 260, height = 44 }: { values: (number | null)[]; markIndex: number; width?: number; height?: number }) {
  const present = values.filter((v): v is number => v !== null)
  if (present.length < 2) return <span className="muted small">not enough data</span>
  const max = Math.max(...present, 1)
  const x = (i: number) => (i / (values.length - 1)) * width
  const y = (v: number) => height - (v / max) * (height - 6) - 3
  const pts = values.flatMap((v, i) => (v === null ? [] : [`${x(i)},${y(v)}`])).join(' ')
  return (
    <svg width={width} height={height} className="stage-trend-line" aria-hidden>
      {markIndex >= 0 && <rect x={x(markIndex)} y={0} width={width - x(markIndex)} height={height} className="stage-trend-window" />}
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function StageTrend({ trend }: { trend: ServiceBuildTrend }) {
  const { analysis, daily, stage_names } = trend
  const markIndex = Math.max(0, daily.length - analysis.window_days)
  return (
    <div className="card flush" data-testid="stage-trend">
      <div className="card-title pad row between">
        <span>Stage p95 trend · last {daily.length} days</span>
        <span className="muted small">shaded: last {analysis.window_days}d, compared with prior {analysis.window_days}d</span>
      </div>
      <table className="table compact">
        <thead>
          <tr><th>Stage</th><th>Daily p95</th><th>Prior {analysis.window_days}d</th><th>Last {analysis.window_days}d</th><th>Change</th></tr>
        </thead>
        <tbody>
          {stage_names.map((name) => {
            const cmp = analysis.stages.find((s) => s.stage === name)
            return (
              <tr key={name} className={cmp?.regressed ? 'stage-regressed' : ''}>
                <td className="mono">{name}{cmp?.regressed && <span className="tag">regressed</span>}</td>
                <td><TrendLine values={daily.map((d) => d.p95_by_stage[name] ?? null)} markIndex={markIndex} /></td>
                <td>{fmtDuration(cmp?.baseline_p95_s ?? 0)}</td>
                <td>{fmtDuration(cmp?.current_p95_s ?? 0)}</td>
                <td className={cmp?.regressed ? 'delta-up' : cmp && cmp.change_pct > 0 ? '' : 'muted'}>
                  {cmp ? `${cmp.change_pct > 0 ? '+' : ''}${cmp.change_pct}%` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
