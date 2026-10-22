import type { Express, Request } from 'express'
import type { FlakyTest, FlakyTestsReport, QuarantinedTest } from '../shared/types.ts'
import { all, get, type Db } from './db.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS quarantined_tests (
  service_id TEXT NOT NULL REFERENCES services(id),
  suite TEXT NOT NULL,
  test_name TEXT NOT NULL,
  reason TEXT,
  quarantined_at TEXT NOT NULL,
  PRIMARY KEY (service_id, suite, test_name)
);
`

const DAY = 86_400_000
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d
const keyOf = (t: { service_id: string; suite: string; test_name: string }) => `${t.service_id}\u0000${t.suite}\u0000${t.test_name}`

interface FailureRow {
  service_id: string
  suite: string
  test_name: string
  run_id: number
  commit_sha: string
  started_at: string
  duration_s: number
  failure_message: string | null
}

/**
 * A test is flaky when, for the same service and commit_sha, it failed in one CI run and passed in another
 * (typically attempt 1 fails and the attempt > 1 re-run passes). Only runs started inside the window count.
 */
export function flakyTests(db: Db, days: number, now = Date.now()): FlakyTestsReport {
  const since = new Date(now - days * DAY).toISOString()
  const results = `
    SELECT t.service_id, t.suite, t.test_name, t.status, t.failure_message, c.id AS run_id, c.commit_sha, c.attempt, c.started_at, c.duration_s
    FROM test_results t JOIN ci_runs c ON c.id = t.run_id
    WHERE c.started_at >= ? AND t.status IN ('passed', 'failed')`
  const flakyCommits = `
    SELECT service_id, suite, test_name, commit_sha FROM r
    GROUP BY service_id, suite, test_name, commit_sha
    HAVING SUM(status = 'failed') > 0 AND SUM(status = 'passed') > 0`

  const failures = all<FailureRow>(db, `
    WITH r AS (${results}), f AS (${flakyCommits})
    SELECT r.service_id, r.suite, r.test_name, r.run_id, r.commit_sha, r.started_at, r.duration_s, r.failure_message
    FROM r JOIN f USING (service_id, suite, test_name, commit_sha)
    WHERE r.status = 'failed'
    ORDER BY r.started_at`, since)

  const reruns = all<{ service_id: string; suite: string; test_name: string; n: number }>(db, `
    WITH r AS (${results}), f AS (${flakyCommits})
    SELECT f.service_id, f.suite, f.test_name, COUNT(DISTINCT c.id) AS n
    FROM f JOIN ci_runs c ON c.service_id = f.service_id AND c.commit_sha = f.commit_sha
    WHERE c.attempt > 1 AND c.started_at >= ?
    GROUP BY f.service_id, f.suite, f.test_name`, since, since)

  const stats = all<{ service_id: string; suite: string; test_name: string; executions: number; failures: number }>(db, `
    SELECT t.service_id, t.suite, t.test_name, COUNT(*) AS executions, SUM(t.status = 'failed') AS failures
    FROM test_results t JOIN ci_runs c ON c.id = t.run_id
    WHERE c.started_at >= ? AND t.status IN ('passed', 'failed')
    GROUP BY t.service_id, t.suite, t.test_name`, since)

  const services = new Map(all<{ id: string; name: string; team: string; owner: string }>(db, 'SELECT id, name, team, owner FROM services').map((s) => [s.id, s]))
  const quarantined = new Map(listQuarantined(db).map((q) => [keyOf(q), q]))
  const rerunsByKey = new Map(reruns.map((r) => [keyOf(r), r.n]))
  const statsByKey = new Map(stats.map((s) => [keyOf(s), s]))

  // A run that failed because of several flaky tests is wasted once, so its minutes are split between them.
  const flakyPerRun = new Map<number, number>()
  for (const f of failures) flakyPerRun.set(f.run_id, (flakyPerRun.get(f.run_id) ?? 0) + 1)

  const byTest = new Map<string, FailureRow[]>()
  for (const f of failures) {
    const k = keyOf(f)
    byTest.set(k, [...(byTest.get(k) ?? []), f])
  }

  const tests: FlakyTest[] = [...byTest.entries()].map(([k, rows]) => {
    const first = rows[0]
    const last = rows[rows.length - 1]
    const svc = services.get(first.service_id)
    const st = statsByKey.get(k)
    const q = quarantined.get(k)
    return {
      service_id: first.service_id,
      service_name: svc?.name ?? first.service_id,
      team: svc?.team ?? '',
      owner: svc?.owner ?? '',
      suite: first.suite,
      test_name: first.test_name,
      executions: st?.executions ?? 0,
      failures: st?.failures ?? 0,
      failure_rate: st?.executions ? round(st.failures / st.executions, 3) : 0,
      flaky_failures: rows.length,
      flaky_commits: new Set(rows.map((r) => r.commit_sha)).size,
      reruns: rerunsByKey.get(k) ?? 0,
      minutes_wasted: round(rows.reduce((a, r) => a + r.duration_s / (flakyPerRun.get(r.run_id) ?? 1), 0) / 60),
      last_flaked_at: last.started_at,
      last_failure_message: [...rows].reverse().find((r) => r.failure_message)?.failure_message ?? null,
      quarantined: Boolean(q),
      quarantined_at: q?.quarantined_at ?? null,
    }
  })
  tests.sort((a, b) => b.flaky_failures - a.flaky_failures || b.reruns - a.reruns || b.minutes_wasted - a.minutes_wasted || a.test_name.localeCompare(b.test_name))

  return {
    window_days: days,
    flaky_tests: tests.length,
    flaky_failures: tests.reduce((a, t) => a + t.flaky_failures, 0),
    reruns: get<{ n: number }>(db, `
      WITH r AS (${results}), f AS (${flakyCommits})
      SELECT COUNT(DISTINCT c.id) AS n FROM ci_runs c
      WHERE c.attempt > 1 AND c.started_at >= ? AND EXISTS (SELECT 1 FROM f WHERE f.service_id = c.service_id AND f.commit_sha = c.commit_sha)`, since, since)!.n,
    minutes_wasted: round(failures.reduce((a, f) => a + f.duration_s / (flakyPerRun.get(f.run_id) ?? 1), 0) / 60),
    quarantined: tests.filter((t) => t.quarantined).length,
    tests,
  }
}

export function listQuarantined(db: Db, serviceId?: string): QuarantinedTest[] {
  return serviceId
    ? all<QuarantinedTest>(db, 'SELECT * FROM quarantined_tests WHERE service_id = ? ORDER BY suite, test_name', serviceId)
    : all<QuarantinedTest>(db, 'SELECT * FROM quarantined_tests ORDER BY service_id, suite, test_name')
}

function testKey(req: Request) {
  const body = (req.body ?? {}) as Record<string, unknown>
  const pick = (k: string) => (typeof body[k] === 'string' && (body[k] as string).length > 0 ? (body[k] as string) : null)
  const service_id = pick('service_id')
  const suite = pick('suite')
  const test_name = pick('test_name')
  if (!service_id || !suite || !test_name) return null
  return { service_id, suite, test_name, reason: pick('reason') }
}

export function registerFlakyRoutes(app: Express, db: Db, clock: () => number = Date.now) {
  db.exec(SCHEMA)

  app.get('/api/flaky-tests', (req, res) => {
    const n = Number(req.query.days)
    const days = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 90) : 30
    res.json(flakyTests(db, days, clock()))
  })

  app.get('/api/flaky-tests/quarantine', (req, res) => {
    const service = typeof req.query.service_id === 'string' && req.query.service_id ? req.query.service_id : undefined
    res.json(listQuarantined(db, service))
  })

  app.post('/api/flaky-tests/quarantine', (req, res) => {
    const key = testKey(req)
    if (!key) return void res.status(400).json({ error: 'service_id, suite and test_name are required' })
    const known = get(db, 'SELECT 1 FROM test_results WHERE service_id = ? AND suite = ? AND test_name = ? LIMIT 1', key.service_id, key.suite, key.test_name)
    if (!known) return void res.status(404).json({ error: 'test not found' })
    db.prepare('INSERT OR IGNORE INTO quarantined_tests (service_id, suite, test_name, reason, quarantined_at) VALUES (?, ?, ?, ?, ?)')
      .run(key.service_id, key.suite, key.test_name, key.reason, new Date(clock()).toISOString())
    res.json(get<QuarantinedTest>(db, 'SELECT * FROM quarantined_tests WHERE service_id = ? AND suite = ? AND test_name = ?', key.service_id, key.suite, key.test_name))
  })

  app.post('/api/flaky-tests/unquarantine', (req, res) => {
    const key = testKey(req)
    if (!key) return void res.status(400).json({ error: 'service_id, suite and test_name are required' })
    const { changes } = db.prepare('DELETE FROM quarantined_tests WHERE service_id = ? AND suite = ? AND test_name = ?').run(key.service_id, key.suite, key.test_name)
    if (!changes) return void res.status(404).json({ error: 'test is not quarantined' })
    res.json({ service_id: key.service_id, suite: key.suite, test_name: key.test_name, quarantined: false })
  })
}
