import type { Db } from './db.ts'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HOUR = 3600_000
const DAY = 24 * HOUR
export const SEED_DAYS = 30

interface StageSpec {
  name: string
  base: number
}

interface TestSpec {
  suite: string
  name: string
  ms: number
  flaky?: number
  error?: string
}

interface ServiceSpec {
  id: string
  name: string
  team: string
  owner: string
  oncall: string
  language: string
  tier: 'tier-0' | 'tier-1' | 'tier-2'
  description: string
  runsPerDay: number
  failRate: number
  stages: StageSpec[]
  tests: TestSpec[]
  deploysPerDay: number
}

export const SERVICES: ServiceSpec[] = [
  {
    id: 'query-compiler', name: 'Query Compiler', team: 'Query Engine', owner: 'Priya Raman', oncall: 'Marcus Lee', language: 'C++', tier: 'tier-0',
    description: 'Parses, optimizes and compiles SQL into distributed execution plans.',
    runsPerDay: 9, failRate: 0.05, deploysPerDay: 0.8,
    stages: [{ name: 'checkout', base: 25 }, { name: 'build', base: 540 }, { name: 'unit-tests', base: 260 }, { name: 'integration-tests', base: 610 }, { name: 'package', base: 70 }],
    tests: [
      { suite: 'optimizer', name: 'test_predicate_pushdown_nested', ms: 820 },
      { suite: 'optimizer', name: 'test_join_reorder_with_spill', ms: 4100, flaky: 0.2, error: 'AssertionError: spill file count 3 != expected 2 (timing-dependent)' },
      { suite: 'optimizer', name: 'test_cte_inlining_limits', ms: 640 },
      { suite: 'parser', name: 'test_qualify_clause_roundtrip', ms: 120 },
      { suite: 'parser', name: 'test_semi_structured_path_access', ms: 180 },
      { suite: 'codegen', name: 'test_vectorized_hash_agg', ms: 2300 },
      { suite: 'codegen', name: 'test_window_frame_bounds', ms: 1500 },
      { suite: 'integration', name: 'test_tpch_q9_plan_stability', ms: 9800 },
      { suite: 'integration', name: 'test_result_cache_invalidation', ms: 5200 },
      { suite: 'integration', name: 'test_cancel_long_running_query', ms: 7400 },
    ],
  },
  {
    id: 'warehouse-scheduler', name: 'Warehouse Scheduler', team: 'Compute Platform', owner: 'Daniel Okafor', oncall: 'Elena Petrova', language: 'Go', tier: 'tier-0',
    description: 'Places queries on virtual warehouses, handles auto-suspend/resume and multi-cluster scaling.',
    runsPerDay: 8, failRate: 0.06, deploysPerDay: 1.1,
    stages: [{ name: 'checkout', base: 15 }, { name: 'build', base: 140 }, { name: 'unit-tests', base: 210 }, { name: 'integration-tests', base: 380 }, { name: 'package', base: 45 }],
    tests: [
      { suite: 'scheduler', name: 'TestQueueFairnessAcrossTenants', ms: 900 },
      { suite: 'scheduler', name: 'TestAutoSuspendRace', ms: 2600, flaky: 0.22, error: 'scheduler_test.go:214: warehouse state = RESUMING, want SUSPENDED (race with heartbeat)' },
      { suite: 'scheduler', name: 'TestMultiClusterScaleOut', ms: 3100 },
      { suite: 'placement', name: 'TestBinPackingRespectsMemory', ms: 400 },
      { suite: 'placement', name: 'TestPreemptionPriority', ms: 750 },
      { suite: 'integration', name: 'TestResumeLatencyBudget', ms: 6400 },
      { suite: 'integration', name: 'TestDrainOnNodeLoss', ms: 8100 },
    ],
  },
  {
    id: 'metadata-store', name: 'Metadata Store', team: 'Metadata', owner: 'Hannah Schultz', oncall: 'Ravi Kumar', language: 'Java', tier: 'tier-0',
    description: 'Transactional catalog for databases, schemas, tables and micro-partition metadata.',
    runsPerDay: 6, failRate: 0.05, deploysPerDay: 0.5,
    stages: [{ name: 'checkout', base: 20 }, { name: 'build', base: 310 }, { name: 'unit-tests', base: 280 }, { name: 'integration-tests', base: 520 }, { name: 'package', base: 60 }],
    tests: [
      { suite: 'CatalogTest', name: 'testCreateTableIdempotent', ms: 300 },
      { suite: 'CatalogTest', name: 'testDropSchemaCascade', ms: 450 },
      { suite: 'CatalogReplicationIT', name: 'testFailoverDuringCommit', ms: 11200, flaky: 0.15, error: 'java.util.concurrent.TimeoutException: replica did not ack within 10000ms' },
      { suite: 'CatalogReplicationIT', name: 'testCrossRegionLag', ms: 8800 },
      { suite: 'PartitionPruningTest', name: 'testMinMaxPruning', ms: 600 },
      { suite: 'TimeTravelIT', name: 'testUndropWithinRetention', ms: 5400 },
    ],
  },
  {
    id: 'ingest-streams', name: 'Ingest Streams', team: 'Data Ingestion', owner: 'Tomás Alvarez', oncall: 'Grace Kim', language: 'Java', tier: 'tier-1',
    description: 'Continuous ingestion from Kafka and object storage with exactly-once commits.',
    runsPerDay: 7, failRate: 0.07, deploysPerDay: 0.9,
    stages: [{ name: 'checkout', base: 20 }, { name: 'build', base: 260 }, { name: 'unit-tests', base: 190 }, { name: 'integration-tests', base: 470 }, { name: 'package', base: 55 }],
    tests: [
      { suite: 'KafkaOffsetCommitIT', name: 'testRebalanceMidBatch', ms: 9300, flaky: 0.25, error: 'org.opentest4j.AssertionFailedError: expected committed offset 5000 but was 4872' },
      { suite: 'KafkaOffsetCommitIT', name: 'testExactlyOnceAfterRestart', ms: 7600 },
      { suite: 'FileNotificationTest', name: 'testDedupeS3Events', ms: 500 },
      { suite: 'SchemaEvolutionTest', name: 'testAddNullableColumn', ms: 420 },
      { suite: 'SchemaEvolutionTest', name: 'testRejectTypeNarrowing', ms: 380 },
      { suite: 'BackpressureIT', name: 'testThrottleUnderLoad', ms: 6900 },
    ],
  },
  {
    id: 'auth-gateway', name: 'Auth Gateway', team: 'Identity', owner: 'Aisha Bello', oncall: 'Chris Novak', language: 'Go', tier: 'tier-0',
    description: 'OAuth, SSO and key-pair authentication front door for all client traffic.',
    runsPerDay: 6, failRate: 0.04, deploysPerDay: 0.7,
    stages: [{ name: 'checkout', base: 12 }, { name: 'build', base: 110 }, { name: 'unit-tests', base: 150 }, { name: 'integration-tests', base: 240 }, { name: 'package', base: 40 }],
    tests: [
      { suite: 'oauth', name: 'TestRefreshTokenRotation', ms: 350 },
      { suite: 'oauth', name: 'TestPKCEVerifierMismatch', ms: 120 },
      { suite: 'saml', name: 'TestClockSkewTolerance', ms: 220 },
      { suite: 'keypair', name: 'TestJWTKeyRollover', ms: 480 },
      { suite: 'integration', name: 'TestRateLimitPerAccount', ms: 4100 },
      { suite: 'integration', name: 'TestMFAChallengeFlow', ms: 3600 },
    ],
  },
  {
    id: 'billing-metering', name: 'Billing Metering', team: 'Billing', owner: 'Liam O\u2019Connor', oncall: 'Sofia Rossi', language: 'Python', tier: 'tier-1',
    description: 'Aggregates credit consumption per warehouse and account for invoicing.',
    runsPerDay: 4, failRate: 0.06, deploysPerDay: 0.4,
    stages: [{ name: 'checkout', base: 10 }, { name: 'build', base: 90 }, { name: 'unit-tests', base: 170 }, { name: 'integration-tests', base: 260 }, { name: 'package', base: 35 }],
    tests: [
      { suite: 'test_rollup', name: 'test_hourly_rollup_dst_boundary', ms: 260 },
      { suite: 'test_rollup', name: 'test_credit_rounding', ms: 90 },
      { suite: 'test_invoice', name: 'test_prorated_capacity_contract', ms: 310 },
      { suite: 'test_integration', name: 'test_late_arriving_usage', ms: 4200 },
      { suite: 'test_integration', name: 'test_replay_is_idempotent', ms: 3900 },
    ],
  },
  {
    id: 'notebook-runtime', name: 'Notebook Runtime', team: 'Developer Tools', owner: 'Mei Chen', oncall: 'Jonah Weiss', language: 'Python', tier: 'tier-2',
    description: 'Containerized kernels that back interactive notebooks and Python worksheets.',
    runsPerDay: 5, failRate: 0.08, deploysPerDay: 1.0,
    stages: [{ name: 'checkout', base: 10 }, { name: 'build', base: 230 }, { name: 'unit-tests', base: 120 }, { name: 'integration-tests', base: 300 }, { name: 'package', base: 90 }],
    tests: [
      { suite: 'test_kernel', name: 'test_kernel_restart_preserves_session', ms: 2100 },
      { suite: 'test_kernel', name: 'test_package_install_sandboxed', ms: 3300 },
      { suite: 'test_kernel', name: 'test_idle_kernel_culling', ms: 1800 },
      { suite: 'test_io', name: 'test_dataframe_preview_truncation', ms: 400 },
      { suite: 'test_io', name: 'test_stage_file_upload', ms: 1200 },
    ],
  },
  {
    id: 'connector-jdbc', name: 'JDBC Driver', team: 'Connectors', owner: 'Oliver Grant', oncall: 'Nadia Haddad', language: 'Java', tier: 'tier-1',
    description: 'Official JDBC driver used by BI tools and customer applications.',
    runsPerDay: 4, failRate: 0.05, deploysPerDay: 0.3,
    stages: [{ name: 'checkout', base: 15 }, { name: 'build', base: 200 }, { name: 'unit-tests', base: 180 }, { name: 'integration-tests', base: 420 }, { name: 'package', base: 50 }],
    tests: [
      { suite: 'ResultSetTest', name: 'testArrowChunkDownload', ms: 900 },
      { suite: 'ResultSetTest', name: 'testTimestampLtzConversion', ms: 150 },
      { suite: 'ConnectionIT', name: 'testKeepAliveHeartbeat', ms: 6100 },
      { suite: 'ConnectionIT', name: 'testProxyWithNtlm', ms: 3900 },
      { suite: 'PreparedStatementIT', name: 'testBatchInsert10k', ms: 7700 },
    ],
  },
  {
    id: 'connector-python', name: 'Python Connector', team: 'Connectors', owner: 'Sara Lindqvist', oncall: 'Oliver Grant', language: 'Python', tier: 'tier-1',
    description: 'Python DB-API connector with pandas and Arrow result fetching.',
    runsPerDay: 5, failRate: 0.06, deploysPerDay: 0.4,
    stages: [{ name: 'checkout', base: 10 }, { name: 'build', base: 160 }, { name: 'unit-tests', base: 140 }, { name: 'integration-tests', base: 360 }, { name: 'package', base: 70 }],
    tests: [
      { suite: 'test_cursor', name: 'test_fetch_pandas_all_types', ms: 1300 },
      { suite: 'test_cursor', name: 'test_arrow_fetch_large_result_timeout', ms: 8200, flaky: 0.12, error: 'TimeoutError: chunk 41/64 download exceeded 30s' },
      { suite: 'test_auth', name: 'test_externalbrowser_token_cache', ms: 600 },
      { suite: 'test_auth', name: 'test_key_pair_auth_encrypted_pem', ms: 300 },
      { suite: 'test_integration', name: 'test_async_query_polling', ms: 4300 },
    ],
  },
  {
    id: 'web-console', name: 'Web Console', team: 'Console', owner: 'Rachel Adams', oncall: 'Kenji Watanabe', language: 'TypeScript', tier: 'tier-1',
    description: 'Browser UI for worksheets, dashboards and account administration.',
    runsPerDay: 11, failRate: 0.07, deploysPerDay: 2.2,
    stages: [{ name: 'checkout', base: 12 }, { name: 'build', base: 180 }, { name: 'unit-tests', base: 130 }, { name: 'e2e-tests', base: 420 }, { name: 'package', base: 40 }],
    tests: [
      { suite: 'worksheet', name: 'runs query and renders result grid', ms: 2400 },
      { suite: 'worksheet', name: 'autosave restores draft after reconnect', ms: 3800, flaky: 0.2, error: 'TimeoutError: locator("[data-testid=draft-banner]") not visible after 5000ms' },
      { suite: 'worksheet', name: 'keyboard shortcut runs selection', ms: 900 },
      { suite: 'dashboards', name: 'tile refresh respects warehouse size', ms: 2100 },
      { suite: 'admin', name: 'role grant dialog validates privileges', ms: 1500 },
      { suite: 'admin', name: 'usage page charts credits by warehouse', ms: 1700 },
    ],
  },
]

const ENGINEERS = [
  'Priya Raman', 'Marcus Lee', 'Daniel Okafor', 'Elena Petrova', 'Hannah Schultz', 'Ravi Kumar', 'Tomás Alvarez', 'Grace Kim',
  'Aisha Bello', 'Chris Novak', 'Sofia Rossi', 'Mei Chen', 'Jonah Weiss', 'Oliver Grant', 'Nadia Haddad', 'Sara Lindqvist',
  'Rachel Adams', 'Kenji Watanabe', 'Arjun Mehta', 'Leah Goldberg', 'Victor Huang', 'Isabel Moreno', 'Ethan Brooks', 'Fatima Zahra',
]

const MESSAGES = [
  'Fix off-by-one in pagination cursor', 'Add metrics for retry budget', 'Refactor config loading', 'Bump dependencies',
  'Handle empty result set edge case', 'Reduce lock contention in hot path', 'Add tracing spans', 'Tighten input validation',
  'Remove dead feature flag', 'Improve error message for auth failures', 'Cache compiled templates', 'Split large test file',
  'Make timeout configurable', 'Document public API', 'Parallelize startup checks', 'Fix nil deref on shutdown',
]

const REGRESSION_DAYS = 5
export const REGRESSION_SERVICE = 'query-compiler'
export const REGRESSION_STAGE = 'integration-tests'
const REGRESSION_COMMIT = 'Upgrade arrow-cpp to 18.1.0 and enable ASan in integration suite'

function iso(ms: number) {
  return new Date(ms).toISOString()
}

export function seed(db: Db, now = Date.now()) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM services').get() as { n: number }
  if (count.n > 0) return

  const r = rng(20261022)
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const jitter = (base: number, pct = 0.15) => Math.max(1, Math.round(base * (1 + (r() * 2 - 1) * pct)))
  const sha = () => Array.from({ length: 10 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('')

  db.exec('BEGIN')
  const insService = db.prepare('INSERT INTO services VALUES (?,?,?,?,?,?,?,?,?)')
  const insRun = db.prepare(`INSERT INTO ci_runs (service_id,pipeline,branch,commit_sha,commit_message,author,trigger,attempt,status,queued_at,started_at,finished_at,queue_s,duration_s)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  const insStage = db.prepare('INSERT INTO ci_stages (run_id,ord,name,status,duration_s) VALUES (?,?,?,?,?)')
  const insTest = db.prepare('INSERT INTO test_results (run_id,service_id,suite,test_name,status,duration_ms,failure_message) VALUES (?,?,?,?,?,?,?)')
  const insDeploy = db.prepare(`INSERT INTO deployments (service_id,environment,version,commit_sha,deployed_by,deployed_at,status,lead_time_h,restored_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
  const insEnv = db.prepare('INSERT INTO dev_environments VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')

  for (const s of SERVICES) {
    insService.run(s.id, s.name, s.team, s.owner, s.oncall, s.language, s.tier, `github.com/data-cloud/${s.id}`, s.description)

    let minor = 10 + Math.floor(r() * 30)
    let patch = 0
    const start = now - SEED_DAYS * DAY

    for (let d = 0; d < SEED_DAYS; d++) {
      const dayStart = start + d * DAY
      const weekend = new Date(dayStart).getUTCDay() % 6 === 0
      const runs = Math.max(1, Math.round(s.runsPerDay * (weekend ? 0.3 : 1) * (0.7 + r() * 0.6)))
      const regressed = s.id === REGRESSION_SERVICE && d >= SEED_DAYS - REGRESSION_DAYS
      const regressionCommitDay = s.id === REGRESSION_SERVICE && d === SEED_DAYS - REGRESSION_DAYS

      for (let i = 0; i < runs; i++) {
        const queuedAt = dayStart + (8 + r() * 11) * HOUR + i * 60_000
        if (queuedAt > now - 10 * 60_000) continue
        const onMain = r() < 0.45
        const author = pick(ENGINEERS)
        const branch = onMain ? 'main' : `${author.split(' ')[0].toLowerCase()}/${pick(['fix', 'feat', 'chore'])}-${Math.floor(r() * 900 + 100)}`
        const message = regressionCommitDay && i === 0 ? REGRESSION_COMMIT : pick(MESSAGES)
        const commit = sha()
        const trigger = onMain ? (r() < 0.1 ? 'schedule' : 'push') : 'pull_request'
        const peak = new Date(queuedAt).getUTCHours() >= 15 && new Date(queuedAt).getUTCHours() <= 18
        const queueS = jitter(peak ? 140 : 35, 0.7)

        const flakyFail = s.tests.filter((t) => t.flaky && r() < t.flaky)
        const realFail = r() < s.failRate
        const cancelled = !realFail && r() < 0.02

        const attempts = flakyFail.length > 0 && !realFail ? 2 : 1
        for (let attempt = 1; attempt <= attempts; attempt++) {
          const failingFlaky = attempt === 1 ? flakyFail : []
          const failed = realFail || failingFlaky.length > 0
          const qAt = queuedAt + (attempt - 1) * 40 * 60_000
          const startedAt = qAt + queueS * 1000
          let total = 0
          const stageRows: [string, string, number][] = []
          let broke = false
          for (const st of s.stages) {
            let dur = jitter(st.base)
            if (regressed && st.name === REGRESSION_STAGE) dur = Math.round(dur * 1.65)
            let status = 'success'
            if (broke || (cancelled && st.name === 'integration-tests')) status = broke ? 'skipped' : 'cancelled'
            const isTestStage = st.name.includes('tests')
            if (!broke && failed && isTestStage) {
              const integration = st.name !== 'unit-tests'
              const flakyHere = failingFlaky.some((t) => isIntegrationSuite(t.suite) === integration)
              const realHere = realFail && (integration ? true : r() < 0.4)
              if (flakyHere || realHere) {
                status = 'failed'
                broke = true
              }
            }
            if (status === 'skipped' || status === 'cancelled') dur = status === 'cancelled' ? Math.round(dur * 0.3) : 0
            total += dur
            stageRows.push([st.name, status, dur])
            if (status === 'cancelled') broke = true
          }
          const status = cancelled ? 'cancelled' : failed ? 'failed' : 'success'
          const finishedAt = startedAt + total * 1000
          const res = insRun.run(s.id, 'ci', branch, commit, message, author, trigger, attempt, status, iso(qAt), iso(startedAt), iso(finishedAt), queueS, total)
          const runId = Number(res.lastInsertRowid)
          stageRows.forEach(([name, st, dur], ord) => insStage.run(runId, ord, name, st, dur))

          const realVictim = realFail ? pick(s.tests.filter((t) => !t.flaky)) : null
          for (const t of s.tests) {
            const stageName = isIntegrationSuite(t.suite) ? s.stages[3].name : 'unit-tests'
            const stage = stageRows.find((x) => x[0] === stageName)!
            if (stage[1] === 'skipped' || stage[1] === 'cancelled') {
              insTest.run(runId, s.id, t.suite, t.name, 'skipped', 0, null)
              continue
            }
            let ms = jitter(t.ms, 0.25)
            if (regressed && stageName === REGRESSION_STAGE) ms = Math.round(ms * 1.7)
            if (failingFlaky.includes(t)) insTest.run(runId, s.id, t.suite, t.name, 'failed', ms, t.error ?? 'assertion failed')
            else if (realVictim === t) insTest.run(runId, s.id, t.suite, t.name, 'failed', ms, `Expected behaviour changed by ${commit.slice(0, 7)}: assertion failed`)
            else insTest.run(runId, s.id, t.suite, t.name, 'passed', ms, null)
          }

          if (!failed && !cancelled && onMain && r() < s.deploysPerDay / (s.runsPerDay * 0.45)) {
            const deployedAt = finishedAt + (0.5 + r() * 30) * HOUR
            if (deployedAt < now) {
              patch++
              if (patch > 9) { minor++; patch = 0 }
              const bad = r() < 0.08
              const leadH = (deployedAt - qAt) / HOUR + r() * 6
              const restored = bad ? iso(deployedAt + (15 + r() * 160) * 60_000) : null
              insDeploy.run(s.id, 'production', `v4.${minor}.${patch}`, commit, author, iso(deployedAt), bad ? pick(['failed', 'rolled_back']) : 'success', Math.round(leadH * 10) / 10, restored)
            }
          }
        }
      }
    }
  }

  const machines: [string, number, number, number][] = [
    ['standard-4', 4, 16, 0.19], ['standard-8', 8, 32, 0.38], ['standard-16', 16, 64, 0.77], ['highmem-16', 16, 128, 1.08], ['gpu-a10g', 8, 32, 1.62], ['compute-32', 32, 128, 1.54],
  ]
  const idleHours = [6.5, 11, 19, 27, 52, 76, 130, 214]
  for (let i = 0; i < 30; i++) {
    const owner = ENGINEERS[i % ENGINEERS.length]
    const svc = SERVICES[(i * 7) % SERVICES.length]
    const [mtype, vcpu, mem, cost] = svc.id === 'query-compiler' || svc.id === 'metadata-store' ? pick(machines.slice(2)) : pick(machines.slice(0, 4))
    const handle = owner.split(' ')[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    let status = r() < 0.35 ? 'stopped' : 'running'
    let lastActive = now - r() * 40 * 60_000
    if (i < idleHours.length) {
      status = 'running'
      lastActive = now - idleHours[i] * HOUR
    } else if (status === 'stopped') lastActive = now - (2 + r() * 120) * HOUR
    const created = Math.min(lastActive, now - (1 + r() * 25) * DAY)
    insEnv.run(`ws-${handle}-${svc.id}-${(i + 1).toString().padStart(2, '0')}`, `${handle}/${svc.id}`, owner, svc.id,
      r() < 0.3 ? 'main' : `${handle}/${pick(['fix', 'feat', 'spike'])}-${Math.floor(r() * 900 + 100)}`,
      mtype, vcpu, mem, pick(['us-west-2', 'us-east-1', 'eu-central-1']), pick(['VS Code', 'VS Code', 'JetBrains Gateway', 'Cursor']),
      status, cost, iso(created), iso(lastActive))
  }

  db.exec('COMMIT')
}

function isIntegrationSuite(suite: string) {
  return /integration|IT$|worksheet|dashboards|admin/.test(suite)
}
