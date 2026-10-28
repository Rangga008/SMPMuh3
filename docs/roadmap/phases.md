# Roadmap — Phase Status

Source of truth for phase progress. Update at the end of every phase.
Phase specs live in `School_Platform_Development_Prompts/`.

| Phase | Goal | Status | Notes |
|---|---|---|---|
| 00 | Discovery & architecture | ✅ Complete | Monorepo skeleton, conventions, docs |
| 01 | Core platform | ✅ Complete | Docker dev env, NestJS, Prisma, auth, RBAC |
| 02 | Design system & SPMB landing | ✅ Complete | spmb landing page + @smpmuh3/ui foundation |
| 03 | SPMB auth & registration | ✅ Complete | Parent accounts, candidates, registrations, S3 docs, status lookup |
| 04 | SPMB admin, verification & payment | ✅ Complete | Staff review/transitions, doc verify, payment domain + provider adapter |
| 05 | Operational dashboard shell | ✅ Complete | apps/operational: modular nav shell, dashboard, SPMB admin UI |
| 06 | Student & academic | ✅ Complete | Students, employees, classes, subjects, enrollment, attendance, assessments |
| 07 | CBT engine | ⬜ Not started | |
| 08 | HR, finance & operations | ⬜ Not started | |
| 09 | Dapodik & ARKAS integrations | ⬜ Not started | Adapter layers only |
| 10 | Notifications & reporting | ⬜ Not started | |
| 11 | Security & production hardening | ⬜ Not started | Nginx, TLS, Cloudflare |
| 12 | Final QA & release | ⬜ Not started | |

Legend: ⬜ not started · 🚧 in progress · ✅ complete · ⚠️ complete w/ known issues

## Phase 00 — completion notes

**Completed**
- Repo inspected: greenfield (only `School_Platform_Development_Prompts/`).
- Monorepo decided & created: pnpm workspaces + Turborepo (ADR-0001).
- Directory skeleton: `apps/{api,public-web,spmb,operational,cbt}`,
  `packages/{ui,types,config,auth}`, `infrastructure/`, `docs/`.
- Root tooling: `package.json`, `pnpm-workspace.yaml`, `turbo.json`,
  `tsconfig.base.json` (strict), `.gitignore`, `.nvmrc`.
- `.env.example` covering app URLs/ports, Postgres, Redis, RabbitMQ,
  S3/MinIO, JWT placeholders, CORS, deferred integration placeholders.
- Dev infrastructure: `infrastructure/docker-compose.yml`
  (PostgreSQL 16, Redis 7, RabbitMQ 3.13, adobe/s3mock for S3).
- Docs: architecture overview, applications map, ADRs 0001–0008,
  getting started, conventions, this roadmap, root README.

**Deferred (by design)**
- Runnable app code — Phase 01/02 scaffold `apps/api` and frontends.
- Prisma schema & migrations — Phase 01.
- Nginx/production configs — Phase 11.

**Known issues**
- `pnpm` is not installed on this machine; docs instruct `corepack enable`.
- App/package dirs contain placeholder `package.json` only — `pnpm dev`
  has nothing to run until Phase 01.

**Next phase:** Phase 01 — Core Platform Foundation.

## Phase 01 — completion notes

**Completed**
- Dev infrastructure running: PostgreSQL 16, Redis 7, RabbitMQ 3.13,
  adobe/s3mock (MinIO is no longer published to Docker Hub — dev uses S3Mock).
- `apps/api` — NestJS 11 modular monolith: `core` (env config via zod,
  PrismaService, health, response/error envelopes, request-id, pino logging),
  `identity` (User/Role/Permission, JWT access + rotating refresh tokens,
  argon2 hashing, JwtAuthGuard + PermissionsGuard, `@Public`/`@RequirePermission`/
  `@CurrentUser` decorators), `school` (academic-year endpoints), `audit`
  (global AuditService + guarded listing).
- Prisma schema v1: User, Role, Permission, UserRole, RolePermission,
  RefreshToken, School, AcademicYear, Document, Notification, AuditLog.
  Migration `init` applied; seed creates permissions, `superadmin` role,
  and admin user from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- Global: ValidationPipe (whitelist + forbidNonWhitelisted), helmet,
  CORS allowlist, throttler (100 req/min), URI versioning `/api/v1`.
- Shared packages: `@smpmuh3/types` (API envelope, PERMISSIONS, auth contracts),
  `@smpmuh3/auth` (permission helpers), `@smpmuh3/config` (eslint preset),
  `@smpmuh3/ui` (foundation: cn()).
- Verified: typecheck ✅, eslint ✅, vitest (5 tests) ✅, `nest build` ✅,
  live smoke test (login → me → guarded CRUD → refresh rotation) ✅.

**Deferred**
- RabbitMQ wiring (connection module/consumers) — when first async job lands.
- Redis usage beyond readiness check (cache, CBT autosave) — per-module.
- Notification delivery — Phase 10. Document upload endpoints — Phase 03/04.

**Known issues**
- `tsx watch` does not emit decorator metadata on this setup → dev uses
  `nest start --watch` (tsc). Keep an eye on; revisit if a faster dev loop is needed.
- Login requires a real email-shaped address — dev seed uses `admin@example.com`.
- `pnpm` via `corepack pnpm` (no admin rights to install the shim globally).
- Benign peer warning: webpack/schema-utils via @nestjs/cli.

**Next phase:** Phase 02 — design system foundation + public-web & SPMB landing.

## Phase 02 — completion notes

**Completed**
- `apps/spmb` — Next.js 15 (App Router, React 19, Turbopack dev) landing page
  on port 3001, all routes statically prerendered (~116 kB first load JS).
- `@smpmuh3/ui` design foundation: Tailwind v4 `@theme` tokens (primary green,
  gold accent, warm "sand" neutrals — Muhammadiyah-inspired, marked as
  unverified brand), `focus-ring` utility, primitives: Button/buttonClasses,
  Container, Section, SectionHeading, Card, Badge, accessible
  details/summary Accordion.
- Landing page: all 13 sections — header (sticky, mobile nav), hero with
  registration status badge, school intro, 4-step SPMB overview, advantages,
  pathways, timeline, requirements, CTA banner, payment info, FAQ, contact,
  footer.
- All SPMB content centralized in `apps/spmb/src/config/spmb.config.ts` —
  typed, placeholder values, TODO markers; no invented facts (dates, fees,
  contact fields render "Akan diumumkan" when unset).
- SEO: metadata + OG, `sitemap.xml`, `robots.txt`, School JSON-LD,
  semantic headings, skip link.
- Accessibility: semantic HTML, native focus states (`focus-ring`),
  keyboard-accessible accordion, `prefers-reduced-motion` support, id_ID.
- Performance: all static, next/font (Plus Jakarta Sans), one client
  component (mobile nav toggle).
- Stub pages `/daftar` and `/cek-status` for the primary CTAs.
- Verified: `next build` ✅, eslint ✅, live HTTP smoke (200s, sitemap,
  robots) ✅.

**Deferred**
- `apps/public-web` — not yet scaffolded (landing is SPMB-focused per phase).
- Registration form & status check implementation — Phase 03.
- Official logo/photos/content — awaiting verified school assets.
- `eslint-config-next` plugin — noted in build warning; consider adding later.

**Known issues**
- No real school photos/logo — placeholders marked TODO in code.
- Font download requires network at build (next/font/google).

**Next phase:** Phase 03 — SPMB auth & candidate registration.

## Phase 03 — completion notes

**Completed**
- API: `POST /auth/register` (role `spmb_parent`), forgot/reset password
  (token hashed di DB, revoke semua refresh token; pengiriman email → Phase 10,
  token dilog di dev), Candidates CRUD (ownership-enforced), Registrations
  (draft/submit, nomor `SPMB-YYYY-XXXXXX`, unique per candidate+tahun aktif),
  Documents (upload multipart → S3; validasi mime/ext/5MB/ownership; download
  streaming privat), Notifications (list + mark read, dibuat saat submit),
  public `GET /registrations/lookup?number&email`, staff list
  `GET /admin/registrations` (`spmb.registration.read`).
- Prisma: Candidate, Registration (+RegistrationStatus enum 10 status),
  PasswordResetToken, Document.registrationId — migrasi `spmb`.
- `StorageService` (S3Client) di core; roles `spmb_admin`, `spmb_parent` seeded.
- Frontend `apps/spmb`: `/masuk`, `/daftar` (parent account), `/akun`
  (dashboard: buat candidate+pendaftaran, list + status), detail
  `/akun/pendaftaran/[id]` (edit draft, upload dokumen, submit), `/cek-status`
  (public lookup). Token Bearer di localStorage (fondasi; cookie → nanti).
- Verified live: register→candidate→registration→upload→submit→lookup→
  notification ✅; typecheck/lint/build api+spmb ✅.

**Deferred**: payment gateway (Phase 04), staff review UI (Phase 04),
email delivery (Phase 10), CBT autosave.

**Known issues**: S3Mock `initialBuckets` env tidak membuat bucket — dibuat
manual via `PUT /smpmuh3-dev` (periksa nama env di versi S3Mock saat setup
ulang). `tsconfig.build.json` ditambahkan agar `dist/main.js` benar.

**Next phase:** Phase 04 — SPMB admin, verification & payment.

## Phase 04 — completion notes

**Completed**
- Admin endpoints (`/api/v1/admin`, `spmb.registration.read/manage`):
  `GET /admin/registrations` (filter status, search nomor/nama/email),
  `GET /admin/registrations/:id` (candidate+parent+docs+invoices+tahun),
  `POST /admin/registrations/:id/transition` — state machine strict
  (SUBMITTED→DOCUMENT_REVIEW/NEEDS_REVISION/VERIFIED/REJECTED →
  SELECTION → ACCEPTED/REJECTED → RE_REGISTRATION → COMPLETED),
  `PATCH /admin/documents/:id/verify` (verified/rejected + note),
  `POST /admin/registrations/:id/invoice`.
- Audit setiap transition/verify; notifikasi orang tua saat
  NEEDS_REVISION/VERIFIED/ACCEPTED/REJECTED.
- Payment domain: `Invoice` + `Payment` (status eksplisit), `providerRef`
  unique sebagai idempotency key, tidak ada kartu disimpan.
- Provider adapter `PaymentProvider` (createInvoice + verifyWebhook) dengan
  `MockPaymentProvider` dev — webhook `POST /webhooks/payments` (public,
  HMAC sha256 signature, idempotent, auto-notify saat SETTLED).
  `MOCK_PAYMENT_SECRET` ditambah ke `.env.example`.
- Parent endpoints: `GET /registrations/:id/invoices`,
  `POST /invoices/:id/checkout` (idempotent PENDING).
- Prisma: Invoice, Payment (+enums), Document.verifiedBy/At/Note —
  migrasi `spmb_admin_payment`. `rawBody: true` di main.ts untuk
  verifikasi signature webhook.
- Verified: typecheck/lint/build ✅.

**Deferred**: UI admin (halaman review staff) — backend siap pakai via API;
UI dibangun bersama operational shell (Phase 05) atau iterasi SPMB berikut.
Real payment gateway (Midtrans/Xendit) — adapter siap ditukar.
Reporting/export CSV — belum diimplementasi.

**Known issues**: webhook mock memakai secret dev; produksi wajib provider
riil + signature scheme masing-masing.

**Next phase:** Phase 05 — operational dashboard shell.

## Phase 05 — completion notes

**Completed**
- `apps/operational` — Next.js 15 admin app, port 3002
  (`admin.smpmuh3bdg.sch.id`), `robots: noindex`.
- Modular navigation model (`src/config/nav.ts`): item = key, label, icon,
  href, permission, children, enabled. `navFor(permissions)` filters by
  permission + feature flag; modul masa depan tampil badge "segera" —
  nav tidak perlu didesain ulang untuk modul baru.
- `Shell`: sidebar (desktop sticky + mobile drawer), header, logout,
  permission-aware menu render.
- Dashboard: widget tahun ajaran aktif (API), total pendaftar + status SPMB
  (endpoint baru `GET /admin/spmb/summary`), quick actions, notifikasi
  terbaru; placeholder widget kesiswaan/kepegawaian (tanpa angka rekaan).
- Reusable `DataTable` (loading/empty/error + horizontal scroll) dan
  `Widget`/`PageTitle`/`PendingWidget`.
- `/masuk` login staf (Bearer token, localStorage — sama seperti spmb).
- **SPMB admin UI** (deferred Phase 04, kini selesai): `/spmb` list dengan
  filter status + pencarian, `/spmb/[id]` detail dengan transisi status
  state-machine, verifikasi/tolak dokumen, dan buat invoice.
- API: `GET /admin/spmb/summary` (groupBy status + total).
- Verified: typecheck/lint semua app ✅, `next build` operational ✅
  (static + dynamic route /spmb/[id]).

**Deferred**: halaman modul lain (placeholder sesuai spec), ikon sistem
(sekarang glyph emoji), cookie auth (localStorage untuk saat ini),
kemampuan export/reporting.

**Known issues**: build warning `eslint-config-next` belum terpasang;
Next menambahkan `allowJs: true` ke tsconfig operational otomatis.

**Next phase:** Phase 06 — student & academic modules.

## Phase 06 — completion notes

**Completed**
- Prisma (migrasi `kesiswaan_akademik`): Student (NIS/NISN unik, status,
  soft-delete `deletedAt`, link `candidateId` → identitas bersama SPMB),
  Employee (TEACHER/STAFF, NIP unik), Curriculum, Subject, Class (rombel
  unik per tahun), Enrollment (unik siswa×tahun), TeachingAssignment,
  ScheduleEntry, AttendanceRecord (unik siswa×tanggal), Achievement,
  Violation, Assessment, Grade (unik siswa×asesmen, validasi maxScore),
  Document.studentId.
- API `src/students`: CRUD siswa (search/status/classId filter, detail
  + enrollments + achievements + violations + ortu), duplicate detection
  (NIS/NISN → 409, nama+tgl lahir sama → 409 kecuali `force`), soft-delete
  arsip, achievement/violation, `POST /attendance` (upsert massal) +
  `GET /attendance?classId&date` — semua audit + permission-gated.
- API `src/academic`: employees CRUD, curricula, subjects (kode unik),
  classes (unik nama×tahun), enrollments (satu rombel/tahun),
  teaching assignments (unik komposit), schedule entries (validasi jam),
  assessments + bulk grade upsert (validasi maxScore).
- Permissions baru (student/employee/academic/attendance read+manage)
  + role `ops_admin` di seed; superadmin 'all' otomatis dapat semua.
- UI `apps/operational`: `/kesiswaan` (list + cari + tambah), `/kesiswaan/[id]`
  (edit, rombel, prestasi, pelanggaran), `/kepegawaian` (pegawai),
  `/akademik` (mapel, rombel, penempatan siswa dgn dropdown).
- Verified live: employee/subject/class/student/enroll 201 → attendance
  mark+list ✅ → assessment + grade upsert ✅ → duplicate student 409 ✅.
  typecheck/lint/build ✅.

**Deferred**: report-card UI (fondasi grades ada), jadwal timetable UI
(endpoint ada), attendance marking UI, sinkronisasi Dapodik (Phase 09).

**Known issues**: `tsconfig.build.tsbuildinfo` sempat membuat `nest build`
skip emit → bersihkan file tsbuildinfo saat dist tidak lengkap; sudah
dikasih `*.tsbuildinfo` di .gitignore.

## SPMB accessibility pass (post-Phase 06)

- `NEXT_PUBLIC_API_URL` added to `.env.example` (frontend API base).
- Parent registration detail now shows **Tagihan Pembayaran**: invoice
  list (number/title/amount), `Bayar` → checkout (PENDING payment via
  provider adapter, mock in dev), Lunas badge when PAID.
- New pages `/lupa-password` (forgot) and `/reset-password` (token
  via ?token= query), linked from `/masuk`.
- Verified all routes 200 on :3001 after restarting stale dev server.

## Dockerized apps (post-Phase 06)

- `apps/api/Dockerfile`, `apps/spmb/Dockerfile`,
  `apps/operational/Dockerfile` — pnpm-aware multi-stage builds
  (deps → types+app build → runner). Root `.dockerignore`.
- Compose services `api`, `spmb`, `operational` added to
  `infrastructure/docker-compose.yml` — env overrides point at service
  hostnames (postgres/redis/s3), healthcheck on `/api/v1/health`,
  `NEXT_PUBLIC_API_URL` build arg → `http://localhost:4000/api/v1`.
- `pnpm infra:up` now brings up the whole stack. Verified: all spmb
  routes + ops routes 200 in containers; API healthy with db+redis.

**Next phase:** Phase 07 — CBT engine.
