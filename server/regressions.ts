import type { Express } from 'express'
import type { BuildAnalysis, BuildRegression, RegressionReport, ServiceBuildTrend, StageComparison, StageTrendDay, SuspectRun } from '../shared/types.ts'
import { all, get, type Db } from './db.ts'
import { percentile } from './metrics.ts'

export const WINDOW_DAYS = 7
export const REGRESSION_THRESHOLD = 0.2
export const MIN_RUNS_PER_WINDOW = 5
export const MIN_STAGE_DELTA_S = 15

const DAY = 86_400_000

export interface RegressionConfig {
  windowDays: number
  threshold: number
  minRuns: number
  minStageDeltaS: number
}

export const DEFAULT_CONFIG: RegressionConfig = {
  windowDays: WINDOW_DAYS,
  threshold: REGRESSION_THRESHOLD,
  minRuns: MIN_RUNS_PER_WINDOW,
  minStageDeltaS: MIN_STAGE_DELTA_S,
}

export interface StageSample {
  name: string
  status: string
  duration_s: number
}

export interface RunSample {
  id: number
  started_at: string
  status: string
  duration_s: number
  commit_sha: string
  commit_message: string
  author: string
  branch: string
  stages: StageSample[]
}

const changePct = (baseline: number, current: number) => (baseline > 0 ? Math.round(((current - baseline) / baseline) * 1000) / 10 : 0)

/** Index of the single change point that best splits `values` into a lower "before" and higher "after" segment (least squares), or -1. */
export function findChangePoint(values: number[]): number {
  const n = values.length
  if (n < 2) return -1
  const sum = [0]
  const sq = [0]
  for (const v of values) {
    sum.push(sum[sum.length - 1] + v)
    sq.push(sq[sq.length - 1] + v * v)
  }
  const sse = (i: number, j: number) => {
    const s = sum[j] - sum[i]
    return sq[j] - sq[i] - (s * s) / (j - i)
  }
  let best = -1
  let bestCost = Infinity
  for (let k = 1; k < n; k++) {
    const before = (sum[k] - sum[0]) / k
    const after = (sum[n] - sum[k]) / (n - k)
    if (after <= before) continue
    const cost = sse(0, k) + sse(k, n)
    if (cost < bestCost) { bestCost = cost; best = k }
  }
  return best
}

/**
 * Pure build-time regression detection for one service. Compares the p95 duration of successful runs in the last
 * `windowDays` against the prior `windowDays`, breaks it down per stage, and locates the first run of the slowdown.
 */
export function analyzeBuildTimes(serviceId: string, runs: RunSample[], now: number, config: RegressionConfig = DEFAULT_CONFIG): BuildAnalysis {
  const { windowDays, threshold, minRuns, minStageDeltaS } = config
  const currentStart = now - windowDays * DAY
  const baselineStart = now - 2 * windowDays * DAY
  const inWindow = runs
    .filter((r) => { const t = Date.parse(r.started_at); return t >= baselineStart && t < now })
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at) || a.id - b.id)
  const isCurrent = (r: RunSample) => Date.parse(r.started_at) >= currentStart
  const successful = inWindow.filter((r) => r.status === 'success')
  const baseline = successful.filter((r) => !isCurrent(r))
  const current = successful.filter(isCurrent)

  const baselineP95 = percentile(baseline.map((r) => r.duration_s), 95)
  const currentP95 = percentile(current.map((r) => r.duration_s), 95)
  const enoughData = baseline.length >= minRuns && current.length >= minRuns
  const regressed = enoughData && baselineP95 > 0 && currentP95 > baselineP95 * (1 + threshold)

  const stageNames: string[] = []
  for (const r of inWindow) for (const s of r.stages) if (!stageNames.includes(s.name)) stageNames.push(s.name)
  const stageP95 = (rs: RunSample[], name: string) =>
    percentile(rs.flatMap((r) => r.stages.filter((s) => s.name === name && s.status === 'success').map((s) => s.duration_s)), 95)
  const stages: StageComparison[] = stageNames.map((name) => {
    const b = stageP95(baseline, name)
    const c = stageP95(current, name)
    return {
      stage: name,
      baseline_p95_s: b,
      current_p95_s: c,
      change_pct: changePct(b, c),
      regressed: enoughData && b > 0 && c > b * (1 + threshold) && c - b >= minStageDeltaS,
    }
  })

  let stage: string | null = null
  let suspect: SuspectRun | null = null
  if (regressed) {
    const worst = [...stages].sort((a, b) => (b.current_p95_s - b.baseline_p95_s) - (a.current_p95_s - a.baseline_p95_s))[0]
    if (worst && worst.current_p95_s > worst.baseline_p95_s) {
      stage = worst.stage
      suspect = locateSuspect(inWindow, worst.stage)
    }
  }

  return {
    service_id: serviceId,
    window_days: windowDays,
    threshold_pct: Math.round(threshold * 100),
    baseline_runs: baseline.length,
    current_runs: current.length,
    baseline_p95_s: baselineP95,
    current_p95_s: currentP95,
    change_pct: changePct(baselineP95, currentP95),
    regressed,
    stage,
    stages,
    suspect,
  }
}

function locateSuspect(runs: RunSample[], stageName: string): SuspectRun | null {
  const series = runs.flatMap((run) => {
    const st = run.stages.find((s) => s.name === stageName && (s.status === 'success' || s.status === 'failed'))
    return st ? [{ run, duration: st.duration_s }] : []
  })
  const k = findChangePoint(series.map((x) => x.duration))
  if (k < 0) return null
  const { run, duration } = series[k]
  return {
    run_id: run.id,
    started_at: run.started_at,
    commit_sha: run.commit_sha,
    commit_message: run.commit_message,
    author: run.author,
    branch: run.branch,
    stage_duration_s: duration,
  }
}

function loadRuns(db: Db, serviceId: string, since: string): RunSample[] {
  const runs = all<Omit<RunSample, 'stages'>>(db,
    'SELECT id, started_at, status, duration_s, commit_sha, commit_message, author, branch FROM ci_runs WHERE service_id = ? AND started_at >= ? ORDER BY started_at, id',
    serviceId, since)
  const stages = all<StageSample & { run_id: number }>(db,
    'SELECT s.run_id, s.name, s.status, s.duration_s FROM ci_stages s JOIN ci_runs r ON r.id = s.run_id WHERE r.service_id = ? AND r.started_at >= ? ORDER BY s.run_id, s.ord',
    serviceId, since)
  const byRun = new Map<number, StageSample[]>()
  for (const { run_id, ...s } of stages) {
    const list = byRun.get(run_id) ?? []
    list.push(s)
    byRun.set(run_id, list)
  }
  return runs.map((r) => ({ ...r, stages: byRun.get(r.id) ?? [] }))
}

export function detectRegressions(db: Db, now: number, config: RegressionConfig = DEFAULT_CONFIG): RegressionReport {
  const since = new Date(now - 2 * config.windowDays * DAY).toISOString()
  const services = all<{ id: string; name: string }>(db, 'SELECT id, name FROM services ORDER BY name')
  const regressions: BuildRegression[] = []
  for (const s of services) {
    const analysis = analyzeBuildTimes(s.id, loadRuns(db, s.id, since), now, config)
    if (analysis.regressed) regressions.push({ ...analysis, service_name: s.name })
  }
  regressions.sort((a, b) => b.change_pct - a.change_pct)
  return { window_days: config.windowDays, threshold_pct: Math.round(config.threshold * 100), services_checked: services.length, regressions }
}

export function serviceBuildTrend(db: Db, serviceId: string, now: number, days: number, config: RegressionConfig = DEFAULT_CONFIG): ServiceBuildTrend {
  const span = Math.max(days, 2 * config.windowDays)
  const runs = loadRuns(db, serviceId, new Date(now - span * DAY).toISOString())
  const analysis = analyzeBuildTimes(serviceId, runs, now, config)
  const stageNames: string[] = []
  for (const r of runs) for (const s of r.stages) if (!stageNames.includes(s.name)) stageNames.push(s.name)

  const buckets = new Map<string, Map<string, number[]>>()
  for (let i = days - 1; i >= 0; i--) buckets.set(new Date(now - i * DAY).toISOString().slice(0, 10), new Map())
  for (const r of runs) {
    if (r.status !== 'success') continue
    const b = buckets.get(r.started_at.slice(0, 10))
    if (!b) continue
    for (const s of r.stages) {
      if (s.status !== 'success') continue
      const list = b.get(s.name) ?? []
      list.push(s.duration_s)
      b.set(s.name, list)
    }
  }
  const daily: StageTrendDay[] = [...buckets.entries()].map(([day, b]) => ({
    day,
    p95_by_stage: Object.fromEntries(stageNames.map((n) => [n, b.has(n) ? percentile(b.get(n)!, 95) : null])),
  }))
  return { analysis, stage_names: stageNames, daily }
}

export function registerRegressionRoutes(app: Express, db: Db, clock: () => number = Date.now) {
  app.get('/api/regressions', (_req, res) => {
    res.json(detectRegressions(db, clock()))
  })

  app.get('/api/regressions/:serviceId', (req, res) => {
    const svc = get(db, 'SELECT id FROM services WHERE id = ?', req.params.serviceId)
    if (!svc) return void res.status(404).json({ error: 'service not found' })
    const n = Number(req.query.days)
    const days = Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 90) : 30
    res.json(serviceBuildTrend(db, req.params.serviceId, clock(), days))
  })
}
