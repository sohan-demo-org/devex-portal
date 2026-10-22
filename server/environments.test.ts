import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { DevEnvironment } from '../shared/types.ts'
import { createApp } from './app.ts'
import { all, openDb, type Db } from './db.ts'
import { IDLE_THRESHOLD_HOURS, isIdle, usageReport, withUsage } from './environments.ts'
import { seed } from './seed.ts'

const HOUR = 3_600_000
const NOW = Date.parse('2026-10-22T12:00:00Z')

let db: Db
let server: Server
let base = ''

async function call(method: string, path: string) {
  const res = await fetch(base + path, { method })
  // oxlint-disable-next-line typescript/no-explicit-any
  const json: any = await res.json()
  return { status: res.status, json }
}

function insertEnv(id: string, status: string, idleH: number, cost: number) {
  db.prepare('INSERT INTO dev_environments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    id, id, 'Test Owner', 'auth-gateway', 'main', 'standard-4', 4, 16, 'us-west-2', 'VS Code', status, cost,
    new Date(NOW - 30 * 24 * HOUR).toISOString(), new Date(NOW - idleH * HOUR).toISOString())
}

const envRow = (id: string) => all<DevEnvironment>(db, 'SELECT * FROM dev_environments WHERE id = ?', id)[0]

before(async () => {
  db = openDb(':memory:')
  seed(db)
  server = createApp(db, () => NOW).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => server.close())

beforeEach(() => {
  db.exec("DELETE FROM dev_environments WHERE id LIKE 'test-%'")
  // Pin the seeded fleet relative to the fixed test clock: nothing idle unless a test inserts it.
  db.prepare("UPDATE dev_environments SET status = 'stopped', last_active_at = ?").run(new Date(NOW - HOUR).toISOString())
})

describe('idle logic', () => {
  const env = (status: DevEnvironment['status'], idleH: number, cost = 2): DevEnvironment => ({
    id: 'x', name: 'x', owner: 'o', service_id: 's', branch: 'main', machine_type: 'm', vcpu: 1, memory_gb: 1, region: 'r', ide: 'i',
    status, hourly_cost: cost, created_at: new Date(NOW - 100 * HOUR).toISOString(), last_active_at: new Date(NOW - idleH * HOUR).toISOString(),
  })

  it('treats running workspaces past the threshold as idle', () => {
    assert.equal(IDLE_THRESHOLD_HOURS, 4)
    assert.equal(isIdle(env('running', 3.9), NOW), false)
    assert.equal(isIdle(env('running', 4), NOW), false)
    assert.equal(isIdle(env('running', 4.1), NOW), true)
    assert.equal(isIdle(env('stopped', 100), NOW), false)
    assert.equal(isIdle(env('hibernated', 100), NOW), false)
  })

  it('computes wasted spend as idle hours x hourly cost', () => {
    const u = withUsage(env('running', 10, 1.5), NOW)
    assert.equal(u.idle, true)
    assert.equal(u.idle_hours, 10)
    assert.equal(u.wasted_spend, 15)
    assert.equal(withUsage(env('running', 1, 1.5), NOW).wasted_spend, 0)
  })

  it('rolls up idle cost per day', () => {
    const r = usageReport([env('running', 5, 1), env('running', 20, 0.5), env('running', 1, 3), env('stopped', 50, 9)], NOW)
    assert.equal(r.idle_count, 2)
    assert.equal(r.idle_hourly_cost, 1.5)
    assert.equal(r.idle_cost_per_day, 36)
    assert.equal(r.wasted_spend_total, 15)
  })
})

describe('GET /api/environments/usage', () => {
  it('flags idle workspaces with wasted spend', async () => {
    insertEnv('test-idle', 'running', 10, 2)
    insertEnv('test-active', 'running', 1, 2)
    const r = await call('GET', '/api/environments/usage')
    assert.equal(r.status, 200)
    assert.equal(r.json.idle_threshold_hours, 4)
    assert.equal(r.json.idle_count, 1)
    assert.equal(r.json.idle_cost_per_day, 48)
    assert.equal(r.json.wasted_spend_total, 20)
    const idle = r.json.environments.find((e: { id: string }) => e.id === 'test-idle')
    assert.deepEqual([idle.idle, idle.idle_hours, idle.wasted_spend], [true, 10, 20])
    const active = r.json.environments.find((e: { id: string }) => e.id === 'test-active')
    assert.deepEqual([active.idle, active.wasted_spend], [false, 0])
  })

  it('finds the seeded idle workspaces', async () => {
    const fresh = openDb(':memory:')
    seed(fresh)
    const s = createApp(fresh).listen(0)
    await new Promise((r) => s.once('listening', r))
    try {
      const res = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/api/environments/usage`)
      // oxlint-disable-next-line typescript/no-explicit-any
      const json: any = await res.json()
      assert.ok(json.idle_count >= 8, `expected >= 8 idle, got ${json.idle_count}`)
      assert.ok(json.wasted_spend_total > 0)
    } finally {
      s.close()
    }
  })
})

describe('POST /api/environments/:id/hibernate', () => {
  it('hibernates a running workspace without touching last activity', async () => {
    insertEnv('test-h', 'running', 10, 2)
    const before = envRow('test-h').last_active_at
    const r = await call('POST', '/api/environments/test-h/hibernate')
    assert.equal(r.status, 200)
    assert.equal(r.json.status, 'hibernated')
    assert.equal(r.json.idle, false)
    assert.equal(r.json.wasted_spend, 0)
    assert.equal(envRow('test-h').status, 'hibernated')
    assert.equal(envRow('test-h').last_active_at, before)
  })

  it('409s unless the workspace is running', async () => {
    insertEnv('test-s', 'stopped', 10, 2)
    insertEnv('test-hh', 'hibernated', 10, 2)
    assert.equal((await call('POST', '/api/environments/test-s/hibernate')).status, 409)
    assert.equal((await call('POST', '/api/environments/test-hh/hibernate')).status, 409)
    assert.equal(envRow('test-s').status, 'stopped')
  })

  it('404s on unknown workspace', async () => {
    assert.equal((await call('POST', '/api/environments/nope/hibernate')).status, 404)
  })
})

describe('POST /api/environments/hibernate-idle', () => {
  it('hibernates only idle running workspaces', async () => {
    insertEnv('test-i1', 'running', 5, 1)
    insertEnv('test-i2', 'running', 72, 0.5)
    insertEnv('test-a', 'running', 2, 3)
    insertEnv('test-st', 'stopped', 50, 9)
    const r = await call('POST', '/api/environments/hibernate-idle')
    assert.equal(r.status, 200)
    assert.deepEqual(r.json.hibernated, ['test-i1', 'test-i2'])
    assert.equal(r.json.count, 2)
    assert.equal(r.json.hourly_savings, 1.5)
    assert.equal(r.json.daily_savings, 36)
    assert.equal(envRow('test-i1').status, 'hibernated')
    assert.equal(envRow('test-i2').status, 'hibernated')
    assert.equal(envRow('test-a').status, 'running')
    assert.equal(envRow('test-st').status, 'stopped')
    assert.equal((await call('GET', '/api/environments/usage')).json.idle_count, 0)
  })

  it('is a no-op when nothing is idle', async () => {
    insertEnv('test-a', 'running', 1, 3)
    const r = await call('POST', '/api/environments/hibernate-idle')
    assert.deepEqual(r.json, { hibernated: [], count: 0, hourly_savings: 0, daily_savings: 0 })
  })
})

describe('start resumes hibernated workspaces', () => {
  it('moves hibernated back to running with fresh activity', async () => {
    insertEnv('test-r', 'running', 30, 2)
    await call('POST', '/api/environments/test-r/hibernate')
    const r = await call('POST', '/api/environments/test-r/start')
    assert.equal(r.status, 200)
    assert.equal(r.json.status, 'running')
    assert.equal(r.json.last_active_at, new Date(NOW).toISOString())
    const usage = (await call('GET', '/api/environments/usage')).json
    assert.equal(usage.environments.find((e: { id: string }) => e.id === 'test-r').idle, false)
  })
})

describe('overview spend', () => {
  it('counts hibernated workspaces as $0', async () => {
    insertEnv('test-o1', 'running', 10, 2)
    insertEnv('test-o2', 'running', 1, 1)
    const beforeSpend = (await call('GET', '/api/metrics/summary')).json
    assert.equal(beforeSpend.env_cost_per_day, 72)
    assert.equal(beforeSpend.running_envs, 2)
    assert.equal(beforeSpend.hibernated_envs, 0)
    await call('POST', '/api/environments/hibernate-idle')
    const afterSpend = (await call('GET', '/api/metrics/summary')).json
    assert.equal(afterSpend.env_cost_per_day, 24)
    assert.equal(afterSpend.running_envs, 1)
    assert.equal(afterSpend.hibernated_envs, 1)
  })
})
