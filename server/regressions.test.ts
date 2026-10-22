import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from './app.ts'
import { openDb } from './db.ts'
import { analyzeBuildTimes, detectRegressions, findChangePoint, REGRESSION_THRESHOLD, WINDOW_DAYS, type RunSample } from './regressions.ts'
import { REGRESSION_SERVICE, REGRESSION_STAGE, seed } from './seed.ts'

const DAY = 86_400_000
const NOW = Date.parse('2026-10-22T15:00:00Z')

function synthetic(opts: { slowFromDay?: number; factor?: number; stage?: string } = {}): RunSample[] {
  const { slowFromDay = Infinity, factor = 1.5, stage = 'test' } = opts
  const runs: RunSample[] = []
  let id = 1
  for (let d = 14; d >= 1; d--) {
    for (let i = 0; i < 4; i++) {
      const startedAt = NOW - d * DAY + i * 3 * 3600_000
      const slow = d <= slowFromDay
      const wobble = 1 + ((id * 7) % 5 - 2) / 100
      const stages = [
        { name: 'build', status: 'success', duration_s: Math.round(200 * wobble) },
        { name: 'test', status: 'success', duration_s: Math.round(300 * wobble) },
        { name: 'package', status: 'success', duration_s: Math.round(30 * wobble) },
      ].map((s) => (slow && s.name === stage ? { ...s, duration_s: Math.round(s.duration_s * factor) } : s))
      runs.push({
        id, started_at: new Date(startedAt).toISOString(), status: 'success',
        duration_s: stages.reduce((n, s) => n + s.duration_s, 0),
        commit_sha: `sha${id}`, commit_message: `commit ${id}`, author: `dev${id % 3}`, branch: 'main', stages,
      })
      id++
    }
  }
  return runs
}

describe('findChangePoint', () => {
  it('finds the start of a step increase', () => {
    assert.equal(findChangePoint([10, 11, 9, 10, 20, 21, 19]), 4)
  })
  it('returns -1 when there is nothing to split or no increase', () => {
    assert.equal(findChangePoint([]), -1)
    assert.equal(findChangePoint([5]), -1)
    assert.equal(findChangePoint([20, 20, 10, 10]), -1)
  })
})

describe('analyzeBuildTimes (synthetic data)', () => {
  it('flags a >20% p95 regression, names the stage and the first slow run', () => {
    const runs = synthetic({ slowFromDay: 4, factor: 1.6 })
    const a = analyzeBuildTimes('svc', runs, NOW)
    assert.equal(a.regressed, true)
    assert.equal(a.window_days, WINDOW_DAYS)
    assert.equal(a.threshold_pct, REGRESSION_THRESHOLD * 100)
    assert.equal(a.baseline_runs, 28)
    assert.equal(a.current_runs, 28)
    assert.ok(a.change_pct > 20)
    assert.equal(a.stage, 'test')
    assert.deepEqual(a.stages.filter((s) => s.regressed).map((s) => s.stage), ['test'])
    const firstSlow = runs.find((r) => Date.parse(r.started_at) >= NOW - 4 * DAY)!
    assert.equal(a.suspect?.run_id, firstSlow.id)
    assert.equal(a.suspect?.commit_message, firstSlow.commit_message)
    assert.equal(a.suspect?.author, firstSlow.author)
  })

  it('does not flag stable builds or slowdowns under the threshold', () => {
    assert.equal(analyzeBuildTimes('svc', synthetic(), NOW).regressed, false)
    const mild = analyzeBuildTimes('svc', synthetic({ slowFromDay: 7, factor: 1.2 }), NOW)
    assert.ok(mild.change_pct > 0 && mild.change_pct < 20)
    assert.equal(mild.regressed, false)
    assert.equal(mild.suspect, null)
  })

  it('ignores failed runs and requires enough data in both windows', () => {
    const runs = synthetic({ slowFromDay: 4, factor: 1.6 }).map((r) => (Date.parse(r.started_at) >= NOW - 4 * DAY ? { ...r, status: 'failed' } : r))
    assert.equal(analyzeBuildTimes('svc', runs, NOW).regressed, false)
    const sparse = synthetic({ slowFromDay: 4, factor: 1.6 }).filter((r) => Date.parse(r.started_at) < NOW - 7 * DAY || r.id % 8 === 0)
    assert.equal(analyzeBuildTimes('svc', sparse, NOW).regressed, false)
  })
})

describe('seeded data', () => {
  it('detects the planted regression whichever day the seed runs', () => {
    for (let k = 0; k < 7; k++) {
      const now = NOW + k * DAY
      const db = openDb(':memory:')
      seed(db, now)
      const report = detectRegressions(db, now)
      assert.deepEqual(report.regressions.map((r) => r.service_id), [REGRESSION_SERVICE], `day offset ${k}`)
      assert.equal(report.regressions[0].stage, REGRESSION_STAGE)
      assert.match(report.regressions[0].suspect!.commit_message, /^Upgrade arrow-cpp/)
      db.close()
    }
  })
})

describe('regressions API', () => {
  let server: Server
  let base = ''
  const getJson = async (path: string) => {
    const res = await fetch(base + path)
    // oxlint-disable-next-line typescript/no-explicit-any
    return { status: res.status, json: (await res.json()) as any }
  }

  before(async () => {
    const db = openDb(':memory:')
    seed(db, NOW)
    server = createApp(db, () => NOW).listen(0)
    await new Promise((r) => server.once('listening', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(() => server.close())

  it('GET /api/regressions flags only the regressed service with stage and suspect commit', async () => {
    const r = await getJson('/api/regressions')
    assert.equal(r.status, 200)
    assert.equal(r.json.window_days, 7)
    assert.equal(r.json.threshold_pct, 20)
    assert.equal(r.json.services_checked, 10)
    assert.equal(r.json.regressions.length, 1)
    const reg = r.json.regressions[0]
    assert.equal(reg.service_id, REGRESSION_SERVICE)
    assert.equal(reg.service_name, 'Query Compiler')
    assert.ok(reg.change_pct > 20)
    assert.ok(reg.current_p95_s > reg.baseline_p95_s)
    assert.equal(reg.stage, REGRESSION_STAGE)
    assert.deepEqual(reg.stages.filter((s: { regressed: boolean }) => s.regressed).map((s: { stage: string }) => s.stage), [REGRESSION_STAGE])
    assert.match(reg.suspect.commit_message, /^Upgrade arrow-cpp to 18\.1\.0/)
    assert.ok(reg.suspect.author)

    const run = await getJson(`/api/runs/${reg.suspect.run_id}`)
    assert.equal(run.json.service_id, REGRESSION_SERVICE)
    assert.equal(run.json.commit_sha, reg.suspect.commit_sha)
    assert.equal(run.json.author, reg.suspect.author)
  })

  it('GET /api/regressions/:serviceId returns the analysis and a per-stage daily p95 trend', async () => {
    const r = await getJson(`/api/regressions/${REGRESSION_SERVICE}?days=30`)
    assert.equal(r.status, 200)
    assert.equal(r.json.analysis.regressed, true)
    assert.equal(r.json.analysis.stage, REGRESSION_STAGE)
    assert.deepEqual(r.json.stage_names, ['checkout', 'build', 'unit-tests', 'integration-tests', 'package'])
    assert.equal(r.json.daily.length, 30)
    const series = r.json.daily.map((d: { p95_by_stage: Record<string, number | null> }) => d.p95_by_stage[REGRESSION_STAGE]).filter((v: number | null) => v !== null)
    const early = Math.max(...series.slice(0, 10))
    const late = Math.min(...series.slice(-3))
    assert.ok(late > early, `expected recent ${REGRESSION_STAGE} p95 (${late}) above earlier (${early})`)
  })

  it('reports healthy services as not regressed', async () => {
    const r = await getJson('/api/regressions/auth-gateway')
    assert.equal(r.status, 200)
    assert.equal(r.json.analysis.regressed, false)
    assert.equal(r.json.analysis.stage, null)
    assert.equal(r.json.analysis.suspect, null)
  })

  it('404s on unknown service', async () => {
    assert.equal((await getJson('/api/regressions/nope')).status, 404)
  })
})
