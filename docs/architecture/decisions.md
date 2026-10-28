# Architecture Decision Records

Short ADRs. Newest at the bottom. Do not edit old entries — supersede them.

## ADR-0001: Monorepo with pnpm + Turborepo

**Status:** Accepted (Phase 00)

The platform has 4 frontends, 1 backend, and shared code (UI, types, config).
A monorepo keeps contracts in sync and enables atomic refactors. pnpm
workspaces handle dependencies; Turborepo orchestrates build/dev/lint tasks.

Alternatives rejected: separate repos (version drift, duplicated config),
Nx (heavier than needed).

## ADR-0002: Modular monolith, not microservices

**Status:** Accepted (Phase 00)

One NestJS API with strict module boundaries, one PostgreSQL database.
The team and scale do not justify distributed-systems overhead. Module
boundaries (per domain) and async events via RabbitMQ preserve the option to
extract a service later (most likely CBT scoring or integrations).

## ADR-0003: Separate Next.js app per subdomain

**Status:** Accepted (Phase 00)

Public site, SPMB, operational dashboard, and CBT have different audiences,
auth surfaces, and release cadences. One Next.js app per subdomain with shared
`packages/ui` keeps them independent yet consistent. Rewrites/multi-zone were
rejected as unnecessary complexity at this stage.

## ADR-0004: PostgreSQL + Prisma as single source of truth

**Status:** Accepted (Phase 00)

All domain data lives in one PostgreSQL database managed by Prisma migrations.
Redis/RabbitMQ/S3 hold ephemeral data, messages, and blobs respectively —
never authoritative domain state.

## ADR-0005: Permission-based authorization (User → Role → Permission)

**Status:** Accepted (Phase 00)

Roles are bundles of permissions; guards check permissions, not role names.
This supports the school's real org structure (staff holding multiple duties)
without code changes when roles evolve.

## ADR-0006: External systems behind integration layers

**Status:** Accepted (Phase 00)

Dapodik, ARKAS, payment gateways, and messaging providers are external. They
will be accessed through versioned adapter modules (Phase 09+) that sync into
our own schema. They are never queried live as the primary store and never
coupled to domain entities directly.

## ADR-0007: Docker Compose for local development

**Status:** Accepted (Phase 00)

PostgreSQL, Redis, RabbitMQ, and an S3-compatible store run via
`infrastructure/docker-compose.yml`. Node apps run on the host (via pnpm/turbo)
for fast iteration; app containerization comes with production hardening.
(MinIO is unavailable on Docker Hub, so development uses `adobe/s3mock`;
production will use a managed/self-hosted S3 service.)

## ADR-0008: TypeScript strict everywhere

**Status:** Accepted (Phase 00)

`tsconfig.base.json` enables strict mode plus `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Shared types flow through `packages/types` so
API contracts are compile-time checked on both sides.
