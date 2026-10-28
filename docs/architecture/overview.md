# Architecture Overview

School platform for **SMP Muhammadiyah 3 Kota Bandung**.

The platform is a **pnpm + Turborepo monorepo** containing three user-facing
applications, one shared backend, and shared packages. It is intentionally a
**modular monolith**: one deployable API, one PostgreSQL database, clear module
boundaries. Microservices are deferred until a demonstrated need exists.

## System Context

```
                        ┌─────────────────────────────────────────┐
                        │              Nginx / Cloudflare          │
                        └───────┬─────────┬─────────┬─────────┬───┘
        www.smpmuh3bdg.sch.id   │  spmb.* │ admin.* │ cbt.*   │
                                ▼         ▼         ▼         ▼
                        ┌──────────┐ ┌────────┐ ┌────────┐ ┌────────┐
                        │public-web│ │  spmb  │ │operati-│ │  cbt   │
                        │(Next.js) │ │(Next.) │ │onal    │ │(Next.) │
                        └────┬─────┘ └───┬────┘ └───┬────┘ └───┬────┘
                             └───────────┴────┬─────┴──────────┘
                                              ▼
                                   ┌──────────────────┐
                                   │   apps/api       │
                                   │ NestJS modular   │
                                   │ monolith         │
                                   └───┬────┬────┬────┘
                                       │    │    │
                          ┌────────────┘    │    └─────────────┐
                          ▼                 ▼                ▼
                    ┌───────────┐    ┌───────────┐    ┌───────────┐
                    │PostgreSQL │    │   Redis   │    │ RabbitMQ  │
                    │  (Prisma) │    │cache/sess.│    │  events   │
                    └───────────┘    └───────────┘    └───────────┘
                          ┌───────────┐
                          │S3-compat. │  documents, uploads
                          │ (S3Mock   │
                          │  in dev)  │
                          └───────────┘
```

## Three Application Boundaries

1. **Public + SPMB** (`apps/public-web`, `apps/spmb`) — public-facing. School
   website, admission landing page, candidate registration, document upload,
   payment status, announcements. Unauthenticated + candidate accounts.
2. **Operational** (`apps/operational`) — internal staff dashboard. School
   administration, student affairs, academic, HR, finance, reporting. Staff
   accounts with permission-based authorization.
3. **CBT** (`apps/cbt`) — exam delivery. Question bank, exam sessions, autosave,
   timing, randomization, scoring, analytics. Student exam accounts.

Each frontend is a **separate Next.js app** on its own subdomain. They share
UI/components and types via `packages/`, but never share pages or routes.

## Shared Backend

One NestJS API (`apps/api`) serves all frontends, organized into modules:

- `core` — config, logging, health, error handling, audit log
- `identity` — User, Role, Permission, authentication, authorization
- `school` — School, AcademicYear, Class, Room, Department
- `people` — Student, Parent, Teacher, Employee
- `spmb` — registration, documents, payment status, announcements
- `cbt` — question bank, exams, scoring
- `hr`, `finance`, `reporting`, `notifications` — later phases
- `integrations` — Dapodik/ARKAS connectors (Phase 09), isolated behind
  interfaces; external systems are never the primary database

Modules may depend on `core` and `identity`; feature modules stay decoupled
and communicate via events (RabbitMQ) where async behavior is needed.

## Authentication Concept

- Single identity store (User) with **Role → Permission** authorization.
- Permissions are checked via guards/policies, not hard-coded role strings.
- Frontends authenticate against the API using a Bearer access token (JWT,
  short-lived) plus a rotating refresh token stored hashed in the database.
  Moving refresh to httpOnly cookies can be decided when frontends land.
  Candidate accounts (SPMB) and staff
  accounts share the identity model but differ by role/permission sets.
- CBT exam sessions may use a constrained exam-token flow so students only
  access their active session.

## Data Ownership

- **PostgreSQL** is the single source of truth for all domain data.
- **Prisma** is the ORM and migration tool; one schema, one migration history.
- **Redis** holds ephemeral data only: cache, rate-limit counters, session
  data, CBT autosave buffers. Never authoritative.
- **RabbitMQ** carries domain events and async jobs (notifications,
  integration sync). Messages are not system of record.
- **S3 storage** holds binary documents (registration files, question images).
  Metadata lives in PostgreSQL (`Document` entity).

## Environments

- **Development**: local Docker Compose (`infrastructure/docker-compose.yml`),
  `.env` per developer, hot reload for all apps.
- **Production** (later phases): containerized apps behind Nginx, managed or
  self-hosted PostgreSQL/Redis/RabbitMQ/S3, Cloudflare in front, per-app
  subdomains.

## Non-Goals (for now)

- No microservices, no Kubernetes.
- No Dapodik/ARKAS/payment integrations until their phases.
- No invented school data — use config and placeholders.
