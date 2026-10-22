import type { DailyCi, MetricsSummary } from '../shared/types.ts'
import { all, get, type Db } from './db.ts'

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d

export function summary(db: Db, days: number, now = Date.now()): MetricsSummary {
  const since = new Date(now - days * 86_400_000).toISOString()
  const deploys = all<{ status: string; lead_time_h: number; deployed_at: string; restored_at: string | null }>(
    db, 'SELECT status, lead_time_h, deployed_at, restored_at FROM deployments WHERE deployed_at >= ?', since)
  const failedDeploys = deploys.filter((d) => d.status !== 'success')
  const restoreMins = failedDeploys.filter((d) => d.restored_at)
    .map((d) => (Date.parse(d.restored_at!) - Date.parse(d.deployed_at)) / 60_000)

  const runs = all<{ status: string; duration_s: number; queue_s: number }>(
    db, "SELECT status, duration_s, queue_s FROM ci_runs WHERE started_at >= ? AND status != 'running'", since)
  const finished = runs.filter((r) => r.status !== 'cancelled')
  const successful = finished.filter((r) => r.status === 'success')

  const envs = get<{ n: number; cost: number }>(db, "SELECT COUNT(*) AS n, COALESCE(SUM(hourly_cost),0) AS cost FROM dev_environments WHERE status = 'running'")!

  return {
    window_days: days,
    deploys_per_day: round(deploys.length / days),
    lead_time_median_h: round(percentile(deploys.map((d) => d.lead_time_h), 50)),
    change_failure_rate: deploys.length ? round(failedDeploys.length / deploys.length, 3) : 0,
    mttr_median_min: Math.round(percentile(restoreMins, 50)),
    ci_runs: runs.length,
    ci_success_rate: finished.length ? round(successful.length / finished.length, 3) : 0,
    build_p50_s: percentile(successful.map((r) => r.duration_s), 50),
    build_p95_s: percentile(successful.map((r) => r.duration_s), 95),
    queue_median_s: percentile(runs.map((r) => r.queue_s), 50),
    running_envs: envs.n,
    env_cost_per_day: round(envs.cost * 24, 2),
    hibernated_envs: get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM dev_environments WHERE status = 'hibernated'")!.n,
  }
}

export function dailyCi(db: Db, days: number, now = Date.now(), serviceId?: string): DailyCi[] {
  const since = new Date(now - days * 86_400_000).toISOString()
  const rows = serviceId
    ? all<{ day: string; status: string; duration_s: number }>(db, 'SELECT substr(started_at,1,10) AS day, status, duration_s FROM ci_runs WHERE started_at >= ? AND service_id = ?', since, serviceId)
    : all<{ day: string; status: string; duration_s: number }>(db, 'SELECT substr(started_at,1,10) AS day, status, duration_s FROM ci_runs WHERE started_at >= ?', since)
  const byDay = new Map<string, { success: number; failed: number; cancelled: number; durations: number[] }>()
  for (let i = days - 1; i >= 0; i--) {
    byDay.set(new Date(now - i * 86_400_000).toISOString().slice(0, 10), { success: 0, failed: 0, cancelled: 0, durations: [] })
  }
  for (const r of rows) {
    const b = byDay.get(r.day)
    if (!b) continue
    if (r.status === 'success') { b.success++; b.durations.push(r.duration_s) }
    else if (r.status === 'failed') b.failed++
    else if (r.status === 'cancelled') b.cancelled++
  }
  return [...byDay.entries()].map(([day, b]) => ({ day, success: b.success, failed: b.failed, cancelled: b.cancelled, p95_duration_s: percentile(b.durations, 95) }))
}
