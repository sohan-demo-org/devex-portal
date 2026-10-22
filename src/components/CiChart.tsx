import type { DailyCi } from '../../shared/types.ts'
import { fmtDuration } from '../util.ts'

export function CiChart({ days, height = 180 }: { days: DailyCi[]; height?: number }) {
  const max = Math.max(...days.map((d) => d.success + d.failed + d.cancelled), 1)
  const maxP95 = Math.max(...days.map((d) => d.p95_duration_s), 1)
  const w = 100 / days.length
  const line = days
    .map((d, i) => `${(i + 0.5) * w},${100 - (d.p95_duration_s / maxP95) * 92}`)
    .join(' ')
  return (
    <div className="chart" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
        {days.map((d, i) => {
          const total = d.success + d.failed + d.cancelled
          const hS = (d.success / max) * 92
          const hF = (d.failed / max) * 92
          const hC = (d.cancelled / max) * 92
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${total} runs, ${d.failed} failed, p95 ${fmtDuration(d.p95_duration_s)}`}</title>
              <rect x={i * w + w * 0.15} width={w * 0.7} y={100 - hS} height={hS} className="bar-success" />
              <rect x={i * w + w * 0.15} width={w * 0.7} y={100 - hS - hF} height={hF} className="bar-failed" />
              <rect x={i * w + w * 0.15} width={w * 0.7} y={100 - hS - hF - hC} height={hC} className="bar-cancelled" />
            </g>
          )
        })}
        <polyline points={line} className="p95-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="chart-axis">
        <span>{days[0]?.day.slice(5)}</span>
        <span>{days[days.length - 1]?.day.slice(5)}</span>
      </div>
      <div className="legend">
        <span><i className="sw bar-success" />passed</span>
        <span><i className="sw bar-failed" />failed</span>
        <span><i className="sw bar-cancelled" />cancelled</span>
        <span><i className="sw line" />p95 build time</span>
      </div>
    </div>
  )
}
