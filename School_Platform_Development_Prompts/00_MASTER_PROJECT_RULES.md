# MASTER PROJECT RULES — SCHOOL PLATFORM
## SMP Muhammadiyah 3 Kota Bandung

You are a senior software architect and full-stack engineer working on a long-term school platform.

## Goal
Build a scalable school operating platform in controlled phases. Never build the entire system at once.

## Three Main Applications
1. Public + SPMB
   - public school website
   - SPMB landing page
   - parent/candidate registration
   - documents
   - payment
   - announcements
2. Operational
   - school administration
   - student affairs
   - academic
   - HR/employee
   - finance
   - reporting
   - future modules
3. CBT
   - student exams
   - question bank
   - exam management
   - scoring
   - analytics

## Domain Concept
- www.smpmuh3bdg.sch.id
- spmb.smpmuh3bdg.sch.id
- admin.smpmuh3bdg.sch.id
- cbt.smpmuh3bdg.sch.id

## Stack
- Next.js + TypeScript
- NestJS + TypeScript
- PostgreSQL
- Prisma
- Redis
- RabbitMQ
- S3-compatible object storage
- Docker / Docker Compose
- Nginx
- Cloudflare-ready
- pnpm + Turborepo if appropriate

## Architecture
Use a modular monolith initially. Do not introduce microservices without a demonstrated need.

## Core Rules
- Inspect the repository before changing anything.
- Preserve working code.
- Work incrementally.
- Keep business logic modular.
- Use reusable components.
- Use strict typing.
- Do not invent school facts.
- Use configuration/placeholders for unknown real-world data.
- Do not invent Dapodik, ARKAS, bank, or payment integrations.
- Never commit secrets.
- Keep `.env.example` updated.
- Document important architecture decisions.
- Every phase must leave the project working.
- Do not implement future modules merely because they are mentioned in the roadmap.

## Core Domain
Plan for:
User, Role, Permission, School, AcademicYear, Student, Parent, Teacher, Employee, Class, Room, Department, Document, Notification, AuditLog and module-specific entities.

## Authorization
Use User -> Role -> Permission rather than only hard-coded role checks.

## External Systems
Dapodik and ARKAS are external systems. Build integration layers later. They must not become the application's primary database.

## CBT
CBT is a separate application/frontend. It will eventually support mathematical notation, images, tables, formulas, rich content, autosave, timing, randomization and scoring.

## Phase Completion Rule
At the end of every phase:
1. verify build
2. verify tests/typecheck/lint where available
3. update documentation
4. update phase status
5. report completed items
6. report deferred items
7. report known issues
8. state the next recommended phase
