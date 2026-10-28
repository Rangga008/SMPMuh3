# Development Conventions

## Naming

| Thing | Convention | Example |
|---|---|---|
| pnpm packages | `@smpmuh3/<name>` | `@smpmuh3/api`, `@smpmuh3/ui` |
| Directories | kebab-case | `apps/public-web` |
| TS files (general) | kebab-case | `exam-session.service.ts` |
| NestJS artifacts | `<name>.<type>.ts` | `student.controller.ts`, `auth.guard.ts` |
| React components | PascalCase files | `RegistrationForm.tsx` |
| DB tables | snake_case plural | `academic_years` |
| DB columns | snake_case | `created_at` |
| Prisma models | PascalCase | `AcademicYear` |
| Env vars | SCREAMING_SNAKE | `JWT_ACCESS_TTL` |
| API routes | kebab-case, plural resources | `/api/v1/academic-years` |
| Events (RabbitMQ) | `<domain>.<entity>.<past-tense-verb>` | `spmb.registration.submitted` |

## TypeScript

- Strict mode is mandatory (`tsconfig.base.json`): `strict`,
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- No `any`. Use `unknown` and narrow.
- Shared contracts live in `packages/types`; API DTOs derive from them.
- Frontends must not import server-only code; the API must not import React.

## API conventions

- Versioned REST: `/api/v1/...` (GraphQL not used).
- Consistent success/error envelope (defined in Phase 01) — handlers never
  return raw errors or ORM entities.
- Input validated with DTOs + class-validator; whitelist unknown fields.
- AuthZ via permission guards: `@RequirePermission('spmb.registration.read')`.

## Database conventions

- One database, one Prisma schema, sequential migrations. Never edit applied
  migrations — create new ones.
- Every entity: `id` (uuid), `created_at`, `updated_at`. Soft delete only
  where the domain requires it.
- Money: integer minor units (e.g. IDR sen) or `numeric` — never float.

## Git conventions

- Small commits, conventional-commit style (`feat:`, `fix:`, `docs:`,
  `chore:`) scoped by app/package where useful: `feat(spmb): ...`.
- Never commit `.env`, secrets, credentials, or real school/personal data.
- Keep `main` always buildable; every phase ends green.

## Security conventions

- Secrets only via environment variables / secret stores.
- Validate everything at the boundary; encode output; parameterized queries
  via Prisma only.
- Rate limit public endpoints; security headers via the app (Phase 01) and
  Nginx/Cloudflare (production).

## Definition of done (per change)

1. `pnpm typecheck` and `pnpm lint` pass for touched packages.
2. Relevant tests pass; new logic has tests where the harness exists.
3. `.env.example` updated when new env vars are introduced.
4. Docs updated when architecture or workflow changes.
