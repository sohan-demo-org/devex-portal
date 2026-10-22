import express, { type Request } from 'express'
import type { CiRun, CiStage, DevEnvironment, RunDetail, TestResult } from '../shared/types.ts'
import { all, get, type Db } from './db.ts'
import { registerFlakyRoutes } from './flaky.ts'
import { buildLog } from './logs.ts'
import { dailyCi, percentile, summary } from './metrics.ts'

const num = (v: unknown, def: number, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : def
}

const str = (req: Request, key: string) => {
  const v = req.query[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export function createApp(db: Db, clock: () => number = Date.now) {
  const app = express()
  app.use(express.json())

  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  app.get('/api/metrics/summary', (req, res) => {
    res.json(summary(db, num(req.query.days, 7, 90) || 7, clock()))
  })

  app.get('/api/metrics/ci-daily', (req, res) => {
    res.json(dailyCi(db, num(req.query.days, 30, 90) || 30, clock(), str(req, 'service')))
  })

  app.get('/api/services', (_req, res) => {
    const since = new Date(clock() - 7 * 86_400_000).toISOString()
    const services = all<Record<string, unknown> & { id: string }>(db, 'SELECT * FROM services ORDER BY name')
    res.json(services.map((s) => {
      const runs = all<{ status: string; duration_s: number }>(db, 'SELECT status, duration_s FROM ci_runs WHERE service_id = ? AND started_at >= ?', s.id, since)
      const finished = runs.filter((r) => r.status === 'success' || r.status === 'failed')
      const last = get<{ status: string }>(db, 'SELECT status FROM ci_runs WHERE service_id = ? ORDER BY started_at DESC LIMIT 1', s.id)
      const deploy = get<{ deployed_at: string }>(db, 'SELECT deployed_at FROM deployments WHERE service_id = ? ORDER BY deployed_at DESC LIMIT 1', s.id)
      return {
        ...s,
        runs_7d: runs.length,
        success_rate_7d: finished.length ? finished.filter((r) => r.status === 'success').length / finished.length : 0,
        p95_duration_s: percentile(runs.filter((r) => r.status === 'success').map((r) => r.duration_s), 95),
        last_run_status: last?.status ?? null,
        last_deploy_at: deploy?.deployed_at ?? null,
      }
    }))
  })

  app.get('/api/services/:id', (req, res) => {
    const s = get(db, 'SELECT * FROM services WHERE id = ?', req.params.id)
    if (!s) return void res.status(404).json({ error: 'service not found' })
    res.json(s)
  })

  app.get('/api/runs', (req, res) => {
    const where: string[] = []
    const params: (string | number)[] = []
    for (const key of ['service_id', 'status', 'branch', 'author'] as const) {
      const v = str(req, key)
      if (v) { where.push(`${key} = ?`); params.push(v) }
    }
    const q = str(req, 'q')
    if (q) { where.push('(commit_message LIKE ? OR commit_sha LIKE ? OR branch LIKE ?)'); params.push(`%${q}%`, `${q}%`, `%${q}%`) }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const limit = num(req.query.limit, 50, 500) || 50
    const offset = num(req.query.offset, 0)
    const total = get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ci_runs ${clause}`, ...params)!.n
    const result = all<CiRun>(db, `SELECT * FROM ci_runs ${clause} ORDER BY started_at DESC, id DESC LIMIT ? OFFSET ?`, ...params, limit, offset)
    res.json({ total, result })
  })

  app.get('/api/runs/:id', (req, res) => {
    const run = get<CiRun>(db, 'SELECT * FROM ci_runs WHERE id = ?', Number(req.params.id))
    if (!run) return void res.status(404).json({ error: 'run not found' })
    const stages = all<CiStage>(db, 'SELECT * FROM ci_stages WHERE run_id = ? ORDER BY ord', run.id)
    const tests = all<TestResult>(db, "SELECT * FROM test_results WHERE run_id = ? ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'passed' THEN 1 ELSE 2 END, suite, test_name", run.id)
    const detail: RunDetail = { ...run, stages, tests, log: buildLog(run, stages, tests) }
    res.json(detail)
  })

  app.get('/api/deployments', (req, res) => {
    const service = str(req, 'service_id')
    const limit = num(req.query.limit, 100, 500) || 100
    const rows = service
      ? all(db, 'SELECT * FROM deployments WHERE service_id = ? ORDER BY deployed_at DESC LIMIT ?', service, limit)
      : all(db, 'SELECT * FROM deployments ORDER BY deployed_at DESC LIMIT ?', limit)
    res.json(rows)
  })

  app.get('/api/environments', (_req, res) => {
    res.json(all<DevEnvironment>(db, "SELECT * FROM dev_environments ORDER BY CASE status WHEN 'running' THEN 0 ELSE 1 END, owner"))
  })

  for (const action of ['start', 'stop'] as const) {
    app.post(`/api/environments/:id/${action}`, (req, res) => {
      const env = get<DevEnvironment>(db, 'SELECT * FROM dev_environments WHERE id = ?', req.params.id)
      if (!env) return void res.status(404).json({ error: 'environment not found' })
      const status = action === 'start' ? 'running' : 'stopped'
      db.prepare('UPDATE dev_environments SET status = ?, last_active_at = ? WHERE id = ?').run(status, new Date(clock()).toISOString(), env.id)
      res.json(get<DevEnvironment>(db, 'SELECT * FROM dev_environments WHERE id = ?', env.id))
    })
  }

  registerFlakyRoutes(app, db, clock)
  return app
}
