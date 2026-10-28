# Getting Started

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 (use `.nvmrc`, currently 22) | nvm / fnm / installer |
| pnpm | ≥ 9 | `corepack enable && corepack prepare pnpm@9.15.0 --activate` |
| Docker Desktop | recent | needed for infrastructure services |
| Git | recent | — |

Node 22 ships Corepack — `corepack enable` is the recommended way to get pnpm.

## First-time setup

```bash
git clone <repo> && cd SMPMuh3
corepack enable
pnpm install
cp .env.example .env      # fill in secrets (see comments inside)
pnpm infra:up             # postgres, redis, rabbitmq, minio
```

Verify infrastructure:

```bash
docker compose -f infrastructure/docker-compose.yml ps
```

Healthy checks: Postgres `pg_isready`, Redis `ping`, RabbitMQ diagnostics,
MinIO console at http://localhost:9001, RabbitMQ UI at http://localhost:15672.

## Everyday development

```bash
pnpm dev          # turbo runs dev in all apps (once apps are scaffolded)
pnpm build        # build everything
pnpm lint         # lint everything
pnpm typecheck    # typecheck everything
pnpm test         # run tests
```

Run a single app (once scaffolded):

```bash
pnpm --filter @smpmuh3/api dev
pnpm --filter @smpmuh3/spmb dev
```

## Database workflow

```bash
pnpm --filter @smpmuh3/api prisma:migrate   # create & apply a dev migration
pnpm --filter @smpmuh3/api prisma:seed      # seed permissions, superadmin, admin user
pnpm --filter @smpmuh3/api db:studio        # Prisma Studio
```

`prisma.config.ts` loads `.env` from the repo root (an app-local
`apps/api/.env` may override). The seed creates an admin from
`ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Run the API

```bash
pnpm --filter @smpmuh3/api dev    # nest watch mode → http://localhost:4000
```

Smoke check:

```bash
curl http://localhost:4000/api/v1/health        # liveness
curl http://localhost:4000/api/v1/health/ready  # db + redis readiness
```

### API surface (Phase 01)

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/health`, `/api/v1/health/ready` | public |
| POST | `/api/v1/auth/login` | public |
| POST | `/api/v1/auth/refresh` | public (refresh token) |
| POST | `/api/v1/auth/logout` | public (refresh token) |
| GET | `/api/v1/auth/me` | bearer |
| GET/POST | `/api/v1/academic-years` | bearer + `school.academic-year.*` |
| GET | `/api/v1/audit-logs` | bearer + `audit.read` |

## Run everything in Docker

```bash
pnpm infra:up   # postgres + redis + rabbitmq + s3 + api + spmb + operational
```

App images build from repo-root context Dockerfiles (`apps/*/Dockerfile`).
URLs: spmb `:3001`, operational `:3002`, api `:4000`. Migrations are run
from the host: `pnpm --filter @smpmuh3/api prisma:migrate`.

## Run the operational app

```bash
pnpm --filter @smpmuh3/operational dev    # → http://localhost:3002
```

Login dengan akun staf (dev: `admin@example.com` / `ADMIN_PASSWORD` dari
`.env`). Navigation lives in `src/config/nav.ts` — tambahkan modul baru
dengan menambah entri (permission + enabled).

## Run the SPMB site

```bash
pnpm --filter @smpmuh3/spmb dev    # → http://localhost:3001
```

Landing content lives in `apps/spmb/src/config/spmb.config.ts` — placeholders
marked TODO pending verified school data.

## Current state

Phase 02 complete: `apps/api` (auth, RBAC, Prisma, health, audit) and
`apps/spmb` (static landing page) both run. Registration backend lands in
Phase 03.
