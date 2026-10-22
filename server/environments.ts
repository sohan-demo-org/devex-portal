import type { Express } from 'express'
import type { DevEnvironment, EnvironmentUsage, EnvironmentUsageReport, HibernateIdleResult } from '../shared/types.ts'
import { all, get, type Db } from './db.ts'

export const IDLE_THRESHOLD_HOURS = 4

const HOUR = 3_600_000
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d

export function idleHours(env: DevEnvironment, now: number): number {
  return Math.max(0, (now - Date.parse(env.last_active_at)) / HOUR)
}

export function isIdle(env: DevEnvironment, now: number, thresholdHours = IDLE_THRESHOLD_HOURS): boolean {
  return env.status === 'running' && idleHours(env, now) > thresholdHours
}

export function withUsage(env: DevEnvironment, now: number): EnvironmentUsage {
  const idle = isIdle(env, now)
  const hours = idle ? idleHours(env, now) : 0
  return { ...env, idle, idle_hours: round(hours, 2), wasted_spend: round(hours * env.hourly_cost) }
}

export function usageReport(envs: DevEnvironment[], now: number): EnvironmentUsageReport {
  const environments = envs.map((e) => withUsage(e, now))
  const idle = environments.filter((e) => e.idle)
  const idleHourly = idle.reduce((a, e) => a + e.hourly_cost, 0)
  return {
    idle_threshold_hours: IDLE_THRESHOLD_HOURS,
    idle_count: idle.length,
    idle_hourly_cost: round(idleHourly),
    idle_cost_per_day: round(idleHourly * 24),
    wasted_spend_total: round(idle.reduce((a, e) => a + e.wasted_spend, 0)),
    environments,
  }
}

export function registerEnvironmentRoutes(app: Express, db: Db, clock: () => number = Date.now) {
  const load = (id: string) => get<DevEnvironment>(db, 'SELECT * FROM dev_environments WHERE id = ?', id)
  const setStatus = db.prepare('UPDATE dev_environments SET status = ? WHERE id = ?')

  app.get('/api/environments/usage', (_req, res) => {
    const envs = all<DevEnvironment>(db, "SELECT * FROM dev_environments ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'hibernated' THEN 1 ELSE 2 END, owner")
    res.json(usageReport(envs, clock()))
  })

  app.post('/api/environments/hibernate-idle', (_req, res) => {
    const now = clock()
    const idle = all<DevEnvironment>(db, "SELECT * FROM dev_environments WHERE status = 'running' ORDER BY id").filter((e) => isIdle(e, now))
    db.exec('BEGIN')
    try {
      for (const e of idle) setStatus.run('hibernated', e.id)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    const hourly = idle.reduce((a, e) => a + e.hourly_cost, 0)
    const result: HibernateIdleResult = {
      hibernated: idle.map((e) => e.id),
      count: idle.length,
      hourly_savings: round(hourly),
      daily_savings: round(hourly * 24),
    }
    res.json(result)
  })

  app.post('/api/environments/:id/hibernate', (req, res) => {
    const env = load(req.params.id)
    if (!env) return void res.status(404).json({ error: 'environment not found' })
    if (env.status !== 'running') return void res.status(409).json({ error: `cannot hibernate a ${env.status} environment` })
    setStatus.run('hibernated', env.id)
    res.json(withUsage(load(env.id)!, clock()))
  })
}
