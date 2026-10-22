export type RunStatus = 'success' | 'failed' | 'running' | 'cancelled'
export type TestStatus = 'passed' | 'failed' | 'skipped'
export type EnvStatus = 'running' | 'stopped'

export interface Service {
  id: string
  name: string
  team: string
  owner: string
  oncall: string
  language: string
  tier: 'tier-0' | 'tier-1' | 'tier-2'
  repo: string
  description: string
}

export interface ServiceSummary extends Service {
  runs_7d: number
  success_rate_7d: number
  p95_duration_s: number
  last_run_status: RunStatus | null
  last_deploy_at: string | null
}

export interface CiRun {
  id: number
  service_id: string
  pipeline: string
  branch: string
  commit_sha: string
  commit_message: string
  author: string
  trigger: 'push' | 'pull_request' | 'schedule'
  attempt: number
  status: RunStatus
  queued_at: string
  started_at: string
  finished_at: string | null
  queue_s: number
  duration_s: number
}

export interface CiStage {
  id: number
  run_id: number
  ord: number
  name: string
  status: RunStatus | 'skipped'
  duration_s: number
}

export interface TestResult {
  id: number
  run_id: number
  service_id: string
  suite: string
  test_name: string
  status: TestStatus
  duration_ms: number
  failure_message: string | null
}

export interface RunDetail extends CiRun {
  stages: CiStage[]
  tests: TestResult[]
  log: string[]
}

export interface Deployment {
  id: number
  service_id: string
  environment: 'production'
  version: string
  commit_sha: string
  deployed_by: string
  deployed_at: string
  status: 'success' | 'failed' | 'rolled_back'
  lead_time_h: number
  restored_at: string | null
}

export interface DevEnvironment {
  id: string
  name: string
  owner: string
  service_id: string
  branch: string
  machine_type: string
  vcpu: number
  memory_gb: number
  region: string
  ide: string
  status: EnvStatus
  hourly_cost: number
  created_at: string
  last_active_at: string
}

export interface MetricsSummary {
  window_days: number
  deploys_per_day: number
  lead_time_median_h: number
  change_failure_rate: number
  mttr_median_min: number
  ci_runs: number
  ci_success_rate: number
  build_p50_s: number
  build_p95_s: number
  queue_median_s: number
  running_envs: number
  env_cost_per_day: number
}

export interface DailyCi {
  day: string
  success: number
  failed: number
  cancelled: number
  p95_duration_s: number
}

export interface Page<T> {
  total: number
  result: T[]
}

// --- build regressions ---
export interface StageComparison {
  stage: string
  baseline_p95_s: number
  current_p95_s: number
  change_pct: number
  regressed: boolean
}

export interface SuspectRun {
  run_id: number
  started_at: string
  commit_sha: string
  commit_message: string
  author: string
  branch: string
  stage_duration_s: number
}

export interface BuildAnalysis {
  service_id: string
  window_days: number
  threshold_pct: number
  baseline_runs: number
  current_runs: number
  baseline_p95_s: number
  current_p95_s: number
  change_pct: number
  regressed: boolean
  stage: string | null
  stages: StageComparison[]
  suspect: SuspectRun | null
}

export interface BuildRegression extends BuildAnalysis {
  service_name: string
}

export interface RegressionReport {
  window_days: number
  threshold_pct: number
  services_checked: number
  regressions: BuildRegression[]
}

export interface StageTrendDay {
  day: string
  p95_by_stage: Record<string, number | null>
}

export interface ServiceBuildTrend {
  analysis: BuildAnalysis
  stage_names: string[]
  daily: StageTrendDay[]
}
