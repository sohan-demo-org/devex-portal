import type { CiRun, CiStage, TestResult } from '../shared/types.ts'

export function buildLog(run: CiRun, stages: CiStage[], tests: TestResult[]): string[] {
  let t = Date.parse(run.started_at)
  const ts = () => new Date(t).toISOString().slice(11, 19)
  const lines: string[] = [
    `${ts()} runner: picked up job ${run.service_id}/${run.pipeline}#${run.id} (attempt ${run.attempt}) after ${run.queue_s}s in queue`,
    `${ts()} runner: image ci-base:2026.10 on pool linux-xlarge`,
  ]
  for (const s of stages) {
    if (s.status === 'skipped') {
      lines.push(`${ts()} [${s.name}] skipped`)
      continue
    }
    lines.push(`${ts()} [${s.name}] started`)
    if (s.name === 'checkout') lines.push(`${ts()} [checkout] HEAD is now at ${run.commit_sha.slice(0, 7)} ${run.commit_message}`)
    if (s.name === 'build') lines.push(`${ts()} [build] remote cache hit rate 71%`)
    if (s.name.includes('tests')) {
      const integration = s.name !== 'unit-tests'
      const mine = tests.filter((x) => isIntegration(x.suite) === integration && x.status !== 'skipped')
      for (const x of mine) {
        lines.push(`${ts()} [${s.name}] ${x.status === 'passed' ? 'PASS' : 'FAIL'} ${x.suite} :: ${x.test_name} (${(x.duration_ms / 1000).toFixed(2)}s)`)
        if (x.failure_message) lines.push(`${ts()} [${s.name}]     ${x.failure_message}`)
      }
    }
    t += s.duration_s * 1000
    lines.push(`${ts()} [${s.name}] ${s.status} in ${s.duration_s}s`)
  }
  lines.push(`${ts()} runner: job finished with status ${run.status.toUpperCase()}`)
  return lines
}

function isIntegration(suite: string) {
  return /integration|IT$|worksheet|dashboards|admin/.test(suite)
}
