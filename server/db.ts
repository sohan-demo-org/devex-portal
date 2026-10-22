import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  owner TEXT NOT NULL,
  oncall TEXT NOT NULL,
  language TEXT NOT NULL,
  tier TEXT NOT NULL,
  repo TEXT NOT NULL,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ci_runs (
  id INTEGER PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id),
  pipeline TEXT NOT NULL,
  branch TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  commit_message TEXT NOT NULL,
  author TEXT NOT NULL,
  trigger TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  queued_at TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  queue_s INTEGER NOT NULL,
  duration_s INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ci_runs_service ON ci_runs(service_id, started_at);
CREATE TABLE IF NOT EXISTS ci_stages (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES ci_runs(id),
  ord INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_s INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ci_stages_run ON ci_stages(run_id);
CREATE TABLE IF NOT EXISTS test_results (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES ci_runs(id),
  service_id TEXT NOT NULL,
  suite TEXT NOT NULL,
  test_name TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  failure_message TEXT
);
CREATE INDEX IF NOT EXISTS test_results_run ON test_results(run_id);
CREATE INDEX IF NOT EXISTS test_results_name ON test_results(service_id, test_name);
CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id),
  environment TEXT NOT NULL,
  version TEXT NOT NULL,
  commit_sha TEXT NOT NULL,
  deployed_by TEXT NOT NULL,
  deployed_at TEXT NOT NULL,
  status TEXT NOT NULL,
  lead_time_h REAL NOT NULL,
  restored_at TEXT
);
CREATE TABLE IF NOT EXISTS dev_environments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  service_id TEXT NOT NULL REFERENCES services(id),
  branch TEXT NOT NULL,
  machine_type TEXT NOT NULL,
  vcpu INTEGER NOT NULL,
  memory_gb INTEGER NOT NULL,
  region TEXT NOT NULL,
  ide TEXT NOT NULL,
  status TEXT NOT NULL,
  hourly_cost REAL NOT NULL,
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);
`

export type Db = DatabaseSync

export function openDb(path: string): Db {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  return db
}

export function all<T>(db: Db, sql: string, ...params: (string | number | null)[]): T[] {
  return db.prepare(sql).all(...params) as T[]
}

export function get<T>(db: Db, sql: string, ...params: (string | number | null)[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined
}
