import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createApp } from './app.ts'
import { openDb } from './db.ts'
import { percentile } from './metrics.ts'
import { REGRESSION_SERVICE, seed } from './seed.ts'

let server: Server
let base = ''

async function call(method: string, path: string) {
  const res = await fetch(base + path, { method })
  // oxlint-disable-next-line typescript/no-explicit-any
  const json: any = await res.json()
  return { status: res.status, json }
}

before(async () => {
  const db = openDb(':memory:')
  seed(db)
  server = createApp(db).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => server.close())

describe('percentile', () => {
  it('uses nearest-rank', () => {
    assert.equal(percentile([], 95), 0)
    assert.equal(percentile([5, 1, 3, 2, 4], 50), 3)
    assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10)
  })
})

describe('metrics', () => {
  it('returns DORA and CI summary', async () => {
    const r = await call('GET', '/api/metrics/summary?days=7')
    assert.equal(r.status, 200)
    assert.ok(r.json.deploys_per_day > 0)
    assert.ok(r.json.ci_success_rate > 0.5 && r.json.ci_success_rate < 1)
    assert.ok(r.json.build_p95_s >= r.json.build_p50_s)
    assert.ok(r.json.running_envs > 0)
  })

  it('returns one bucket per day', async () => {
    const r = await call('GET', '/api/metrics/ci-daily?days=14')
    assert.equal(r.json.length, 14)
  })
})

describe('runs', () => {
  it('filters by service and status', async () => {
    const r = await call('GET', '/api/runs?service_id=auth-gateway&status=failed&limit=5')
    assert.equal(r.status, 200)
    assert.ok(r.json.total > 0)
    for (const run of r.json.result) {
      assert.equal(run.service_id, 'auth-gateway')
      assert.equal(run.status, 'failed')
    }
  })

  it('returns stages, tests and log for a run', async () => {
    const list = await call('GET', `/api/runs?service_id=${REGRESSION_SERVICE}&limit=1`)
    const r = await call('GET', `/api/runs/${list.json.result[0].id}`)
    assert.equal(r.status, 200)
    assert.ok(r.json.stages.length >= 4)
    assert.ok(r.json.tests.length > 0)
    assert.ok(r.json.log.some((l: string) => l.includes('[checkout]')))
  })

  it('404s on unknown run', async () => {
    assert.equal((await call('GET', '/api/runs/999999')).status, 404)
  })
})

describe('environments', () => {
  it('stops and starts a workspace', async () => {
    const envs = (await call('GET', '/api/environments')).json
    const running = envs.find((e: { status: string }) => e.status === 'running')
    const stopped = await call('POST', `/api/environments/${running.id}/stop`)
    assert.equal(stopped.json.status, 'stopped')
    const started = await call('POST', `/api/environments/${running.id}/start`)
    assert.equal(started.json.status, 'running')
  })
})
