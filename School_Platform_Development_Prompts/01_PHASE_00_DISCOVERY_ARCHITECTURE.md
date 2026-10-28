# PHASE 00 — DISCOVERY, ARCHITECTURE & PROJECT FOUNDATION

## Objective
Understand the repository and establish the long-term architecture before building business features.

## Read First
- `00_MASTER_PROJECT_RULES.md`
- `00_PHASE_INDEX.md`

## Tasks
1. Inspect the complete repository.
2. Identify apps, packages, dependencies, Docker files, environment files, database configuration and documentation.
3. Preserve existing working code.
4. Decide whether the project should use a monorepo.
5. If starting from scratch, prefer:
   - `apps/api`
   - `apps/public-web`
   - `apps/spmb`
   - `apps/operational`
   - `apps/cbt`
   - `packages/ui`
   - `packages/types`
   - `packages/config`
   - `packages/auth`
   - `infrastructure/`
   - `docs/`
6. Establish Next.js and NestJS conventions.
7. Establish PostgreSQL + Prisma conventions.
8. Establish Docker development conventions.
9. Establish `.env.example`.
10. Establish naming conventions.
11. Establish development documentation.

## Documentation
Create/update:
- `docs/architecture/overview.md`
- `docs/architecture/applications.md`
- `docs/architecture/decisions.md`
- `docs/roadmap/phases.md`
- `README.md`

## Document
- three application boundaries
- shared backend
- authentication concept
- database ownership
- storage
- Redis
- RabbitMQ
- future integrations
- domains
- development vs production

## Do Not
- build full SPMB
- build CBT
- build all operational modules
- add microservices
- invent school information

## Done When
A developer can understand the architecture and start the development environment without guessing.
