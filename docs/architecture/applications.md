# Applications & Packages

## Layout

```
apps/
  api/            NestJS modular monolith — single backend
  public-web/     Next.js — public school website
  spmb/           Next.js — admission (SPMB) site
  operational/    Next.js — internal staff dashboard
  cbt/            Next.js — computer-based test
packages/
  ui/             Shared components & design tokens
  types/          Shared TypeScript types & API contracts
  config/         tsconfig presets, lint/format configs, env helpers
  auth/           Shared auth helpers (client-side guards, permission utils)
infrastructure/   Docker Compose dev services, future deploy configs
docs/             Architecture, development, roadmap documentation
```

## Applications

| App | Stack | Dev port | Domain | Phase scaffolded |
|---|---|---|---|---|
| `apps/public-web` | Next.js + TS | 3000 | www.smpmuh3bdg.sch.id | 02 |
| `apps/spmb` | Next.js + TS | 3001 | spmb.smpmuh3bdg.sch.id | 02–04 |
| `apps/operational` | Next.js + TS | 3002 | admin.smpmuh3bdg.sch.id | 05+ |
| `apps/cbt` | Next.js + TS | 3003 | cbt.smpmuh3bdg.sch.id | 07 |
| `apps/api` | NestJS + TS | 4000 | api endpoints under each domain / internal | 01 |

### Frontend conventions (all Next.js apps)

- App Router, TypeScript strict mode, Server Components by default.
- Data fetching goes through a typed API client in `packages/types`-aligned
  contracts — no direct database access, no ad-hoc `fetch` scattered in pages.
- Shared UI comes from `packages/ui`; app-specific components live in the app.
- Each app owns its own subdomain and auth surface.

### API conventions (`apps/api`)

- NestJS modules per domain (`identity`, `school`, `people`, `spmb`, `cbt`, …).
- Controllers are thin; business logic lives in services.
- Prisma for persistence; one database, one migration history.
- Global: validation pipe (class-validator), error filter (consistent error
  shape), request logging, audit log hooks, rate limiting, CORS allowlist.
- Authorization: `User → Role → Permission` checked by guards/policies.

## Shared Packages

| Package | Purpose |
|---|---|
| `@smpmuh3/ui` | Design system: tokens, primitives, composed components. Frontends only. |
| `@smpmuh3/types` | DTOs, enums, API response shapes shared across apps and API. |
| `@smpmuh3/config` | Tooling config presets (tsconfig, eslint, prettier) and env parsing. |
| `@smpmuh3/auth` | Permission constants, client guards, session helpers. |

Packages are consumed via pnpm workspace dependencies (`workspace:*`).

## Service Map (development)

| Service | Port | Notes |
|---|---|---|
| PostgreSQL 16 | 5432 | `smpmuh3` database |
| Redis 7 | 6379 | cache, sessions, rate limits, CBT autosave |
| RabbitMQ 3.13 | 5672 / 15672 | events & async jobs; management UI |
| S3Mock (adobe/s3mock) | 9000 | S3 API; `smpmuh3-dev` bucket auto-created |
