import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from './app.ts'
import { openDb, type Db } from './db.ts'
import { seed } from './seed.ts'

const servers: Server[] = []

async function start(db: Db, clock?: () => number) {
  const server = createApp(db, clock).listen(0)
  servers.push(server)
  await new Promise((r) => server.once('listening', r))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    // oxlint-disable-next-line typescript/no-explicit-any
    const json: any = await res.json()
    return { status: res.status, json }
  }
}

after(() => { for (const s of servers) s.close() })

const NOW = Date.parse('2026-06-15T12:00:00Z')
const at = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString()

/** Tiny hand-built fleet so the flaky maths can be asserted exactly. */
function fixture() {
  const db = openDb(':memory:')
  db.prepare('INSERT INTO services VALUES (?,?,?,?,?,?,?,?,?)').run('svc', 'Svc', 'Team A', 'Ada Owner', 'Bob', 'Go', 'tier-1', 'github.com/x/svc', 'test service')
  const insRun = db.prepare(`INSERT INTO ci_runs (service_id,pipeline,branch,commit_sha,commit_message,author,trigger,attempt,status,queued_at,started_at,finished_at,queue_s,duration_s)
    VALUES ('svc','ci','main',?,'msg','dev','push',?,?,?,?,?,0,?)`)
  const insTest = db.prepare("INSERT INTO test_results (run_id,service_id,suite,test_name,status,duration_ms,failure_message) VALUES (?,'svc',?,?,?,100,?)")
  const run = (sha: string, attempt: number, daysAgo: number, durationS: number, tests: [string, 'passed' | 'failed', string?][]) => {
    const failed = tests.some((t) => t[1] === 'failed')
    const id = Number(insRun.run(sha, attempt, failed ? 'failed' : 'success', at(daysAgo), at(daysAgo), at(daysAgo), durationS).lastInsertRowid)
    for (const [name, status, msg] of tests) insTest.run(id, 'unit', name, status, msg ?? null)
    return id
  }
  // c1: Racy and Shaky both fail on attempt 1, pass on the re-run -> both flaky, the 600s run is split between them.
  run('c1', 1, 3, 600, [['Racy', 'failed', 'race 1'], ['Shaky', 'failed', 'timeout'], ['Stable', 'passed']])
  run('c1', 2, 3, 500, [['Racy', 'passed'], ['Shaky', 'passed'], ['Stable', 'passed']])
  // c2: only Racy flakes; 300s wasted.
  run('c2', 1, 1, 300, [['Racy', 'failed', 'race 2'], ['Shaky', 'passed'], ['Stable', 'passed']])
  run('c2', 2, 1, 280, [['Racy', 'passed'], ['Shaky', 'passed'], ['Stable', 'passed']])
  // c3: Stable fails for real (no passing run of the same commit) -> not flaky, but counts toward its failure rate.
  run('c3', 1, 2, 200, [['Racy', 'passed'], ['Shaky', 'passed'], ['Stable', 'failed', 'real bug']])
  // c4: Shaky flaked 40 days ago -> outside the default 30-day window.
  run('c4', 1, 40, 900, [['Racy', 'passed'], ['Shaky', 'failed', 'old'], ['Stable', 'passed']])
  run('c4', 2, 40, 900, [['Racy', 'passed'], ['Shaky', 'passed'], ['Stable', 'passed']])
  return db
}

describe('flaky test detection (fixture)', () => {
  let call: Awaited<ReturnType<typeof start>>
  before(async () => { call = await start(fixture(), () => NOW) })

  it('flags tests that failed and passed on the same commit, ranked by impact', async () => {
    const r = await call('GET', '/api/flaky-tests')
    assert.equal(r.status, 200)
    assert.equal(r.json.window_days, 30)
    assert.deepEqual(r.json.tests.map((t: { test_name: string }) => t.test_name), ['Racy', 'Shaky'])

    const [racy, shaky] = r.json.tests
    assert.equal(racy.flaky_failures, 2)
    assert.equal(racy.flaky_commits, 2)
    assert.equal(racy.reruns, 2)
    assert.equal(racy.minutes_wasted, 10) // 600s / 2 + 300s
    assert.equal(racy.failure_rate, 0.4) // 2 failures in 5 executions
    assert.equal(racy.last_flaked_at, at(1))
    assert.equal(racy.last_failure_message, 'race 2')
    assert.equal(racy.owner, 'Ada Owner')
    assert.equal(racy.team, 'Team A')
    assert.equal(racy.quarantined, false)

    assert.equal(shaky.flaky_failures, 1)
    assert.equal(shaky.reruns, 1)
    assert.equal(shaky.minutes_wasted, 5) // 600s / 2

    assert.equal(r.json.flaky_tests, 2)
    assert.equal(r.json.flaky_failures, 3)
    assert.equal(r.json.reruns, 2) // c1 and c2 re-runs, counted once each
    assert.equal(r.json.minutes_wasted, 15)
  })

  it('respects the days window', async () => {
    const r = await call('GET', '/api/flaky-tests?days=60')
    const shaky = r.json.tests.find((t: { test_name: string }) => t.test_name === 'Shaky')
    assert.equal(shaky.flaky_failures, 2)
    assert.equal(r.json.reruns, 3)
    assert.equal(r.json.window_days, 60)
    assert.equal((await call('GET', '/api/flaky-tests?days=1000')).json.window_days, 90)
  })
})

describe('flaky test detection (seeded data)', () => {
  let call: Awaited<ReturnType<typeof start>>
  before(async () => {
    const db = openDb(':memory:')
    seed(db)
    call = await start(db)
  })

  it('finds the known offenders with owners from the catalog', async () => {
    const r = await call('GET', '/api/flaky-tests')
    const names = r.json.tests.map((t: { test_name: string }) => t.test_name)
    for (const known of ['TestAutoSuspendRace', 'testRebalanceMidBatch']) assert.ok(names.includes(known), `${known} missing`)
    assert.ok(r.json.reruns > 0 && r.json.minutes_wasted > 0)
    for (let i = 1; i < r.json.tests.length; i++) assert.ok(r.json.tests[i - 1].flaky_failures >= r.json.tests[i].flaky_failures)
    for (const t of r.json.tests) {
      assert.ok(t.owner.length > 0)
      assert.ok(t.failure_rate > 0 && t.failure_rate < 1)
      assert.ok(t.reruns > 0)
      assert.ok(t.last_failure_message)
    }
  })
})

describe('quarantine', () => {
  const db = fixture()
  const racy = { service_id: 'svc', suite: 'unit', test_name: 'Racy' }
  let call: Awaited<ReturnType<typeof start>>
  before(async () => { call = await start(db, () => NOW) })

  it('quarantines and persists across app instances', async () => {
    const q = await call('POST', '/api/flaky-tests/quarantine', { ...racy, reason: 'owner investigating' })
    assert.equal(q.status, 200)
    assert.equal(q.json.quarantined_at, new Date(NOW).toISOString())
    assert.equal(q.json.reason, 'owner investigating')
    // idempotent
    assert.equal((await call('POST', '/api/flaky-tests/quarantine', racy)).json.quarantined_at, new Date(NOW).toISOString())

    const fresh = await start(db, () => NOW)
    const list = await fresh('GET', '/api/flaky-tests/quarantine?service_id=svc')
    assert.deepEqual(list.json.map((t: { test_name: string }) => t.test_name), ['Racy'])
    const report = await fresh('GET', '/api/flaky-tests')
    assert.equal(report.json.quarantined, 1)
    assert.equal(report.json.tests.find((t: { test_name: string }) => t.test_name === 'Racy').quarantined, true)
    assert.deepEqual((await fresh('GET', '/api/flaky-tests/quarantine?service_id=other')).json, [])
  })

  it('unquarantines', async () => {
    const r = await call('POST', '/api/flaky-tests/unquarantine', racy)
    assert.equal(r.status, 200)
    assert.equal(r.json.quarantined, false)
    assert.deepEqual((await call('GET', '/api/flaky-tests/quarantine')).json, [])
    assert.equal((await call('POST', '/api/flaky-tests/unquarantine', racy)).status, 404)
  })

  it('validates input', async () => {
    assert.equal((await call('POST', '/api/flaky-tests/quarantine', { service_id: 'svc' })).status, 400)
    assert.equal((await call('POST', '/api/flaky-tests/quarantine', { ...racy, test_name: 'Nope' })).status, 404)
    assert.equal((await call('POST', '/api/flaky-tests/unquarantine', {})).status, 400)
  })
})
