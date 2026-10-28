# SMP Muhammadiyah 3 — School Platform

Platform operasional sekolah untuk **SMP Muhammadiyah 3 Kota Bandung**,
dibangun bertahap dalam fase terkontrol.

Tiga aplikasi utama di atas satu backend bersama (modular monolith):

| Aplikasi | Domain | Isi |
|---|---|---|
| Public + SPMB | www.smpmuh3bdg.sch.id · spmb.smpmuh3bdg.sch.id | Website publik, pendaftaran siswa baru, dokumen, pembayaran, pengumuman |
| Operational | admin.smpmuh3bdg.sch.id | Administrasi, kesiswaan, akademik, HR, keuangan, pelaporan |
| CBT | cbt.smpmuh3bdg.sch.id | Ujian berbasis komputer: bank soal, sesi ujian, penilaian, analitik |

## Stack

Next.js · NestJS · TypeScript (strict) · PostgreSQL + Prisma · Redis ·
RabbitMQ · S3-compatible storage · Docker Compose · pnpm + Turborepo

## Repository layout

```
apps/            5 applications (api + 4 Next.js frontends)
packages/        shared ui / types / config / auth
infrastructure/  docker-compose dev services
docs/            architecture, development guides, roadmap
School_Platform_Development_Prompts/  phase specifications
```

## Quickstart

```bash
corepack enable            # provides pnpm (Node ≥ 20)
pnpm install
cp .env.example .env       # fill in local secrets
pnpm infra:up              # start postgres, redis, rabbitmq, minio
pnpm dev                   # run all apps (once scaffolded)
```

See **[docs/development/getting-started.md](docs/development/getting-started.md)**
for details and troubleshooting.

## Documentation

- [Architecture overview](docs/architecture/overview.md)
- [Applications & packages](docs/architecture/applications.md)
- [Architecture decisions (ADRs)](docs/architecture/decisions.md)
- [Development conventions](docs/development/conventions.md)
- [Roadmap & phase status](docs/roadmap/phases.md)

## Status

**Phase 02 complete** — core platform (API, auth/RBAC, Prisma, audit) plus
the SPMB public landing page (`apps/spmb`) and `@smpmuh3/ui` design
foundation. See [docs/roadmap/phases.md](docs/roadmap/phases.md).
