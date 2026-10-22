# Velocity · Developer Portal

Velocity is the internal developer portal for the Engineering Productivity org. It gives every engineer and engineering
manager one place to see:

- **Overview**: DORA metrics (deployment frequency, lead time, change failure rate, time to restore), CI success
  rate, p50/p95 build time, runner queue time, and cloud dev environment spend.
- **CI Runs**: every pipeline run across the fleet, with stage timings, per-test results and logs.
- **Service Catalog**: ownership, on-call, tier and build health for each service.
- **Deployments**: production releases with lead time and recovery data.
- **Dev Environments**: remote workspaces (machine size, region, IDE, last activity, hourly cost) with start/stop.

## Stack

| Layer | Tech |
| --- | --- |
| Web | React 19, React Router 7, Vite 8, plain CSS (`src/`) |
| API | Express 5 on Node 24, run directly as TypeScript (`server/`) |
| Storage | SQLite via built-in `node:sqlite` (`data/velocity.db`, created on first run) |
| Shared types | `shared/types.ts` |

There is no build step for the API and no native dependencies.

## Getting started

```bash
npm ci
npm run dev        # API on :3001, web on :5173 (Vite proxies /api)
```

Open http://localhost:5173.

The database is seeded on first start with 30 days of CI, test, deployment and dev-environment telemetry for ten
services (`server/seed.ts`). Dates are relative to when the seed runs. To reseed:

```bash
npm run reset-db && npm run dev
```

## Checks

```bash
npm run lint       # oxlint
npm run typecheck  # tsc -b (web, server, vite config)
npm test           # node:test API tests against an in-memory DB
npm run build      # production bundle in dist/ (served by `npm start`)
```

CI (`.github/workflows/ci.yml`) runs all four on every PR.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/metrics/summary?days=7` | DORA + CI + env-spend rollup |
| GET | `/api/metrics/ci-daily?days=30&service=` | daily pass/fail counts and p95 build time |
| GET | `/api/services` / `/api/services/:id` | catalog with 7-day health |
| GET | `/api/runs?service_id=&status=&branch=&author=&q=&limit=&offset=` | paginated CI runs |
| GET | `/api/runs/:id` | run with stages, test results and log |
| GET | `/api/deployments?service_id=` | production deployments |
| GET | `/api/environments` | dev environments |
| POST | `/api/environments/:id/start` / `stop` | change workspace state |
| GET | `/api/environments/usage` | workspaces with idle state, idle hours and wasted spend (idle = running, no activity for > 4h) |
| POST | `/api/environments/:id/hibernate` | release compute ($0/hr), keep the disk; `start` resumes it |
| POST | `/api/environments/hibernate-idle` | hibernate every idle workspace |

## Data model

`services` → `ci_runs` (one row per attempt; a re-run of the same commit has `attempt = 2`) → `ci_stages` and
`test_results`. `deployments` and `dev_environments` reference `services`.
