# PHASE 01 — CORE PLATFORM FOUNDATION

## Objective
Build the reusable technical foundation required by all future applications.

## Tasks
1. Docker Compose development environment.
2. PostgreSQL.
3. Redis.
4. RabbitMQ where appropriate.
5. Local S3-compatible storage where useful.
6. NestJS API structure.
7. Prisma configuration.
8. Database migration workflow.
9. Environment configuration.
10. Error handling.
11. Validation.
12. Logging.
13. Audit log foundation.
14. User entity.
15. Role entity.
16. Permission entity.
17. Role-permission mapping.
18. Authentication foundation.
19. Authorization guards/policies.
20. Shared UI foundations.
21. API response/error conventions.
22. Health checks.
23. Basic rate limiting/security conventions.

## Core Entities
- User
- Role
- Permission
- School
- AcademicYear
- Document
- Notification
- AuditLog

Do not overbuild SPMB, CBT, Finance or HR yet.

## Security
- password hashing
- secure auth
- validation
- rate limiting
- CORS
- security headers
- secrets outside source control

## Done When
Docker starts reliably, migrations work, API starts, auth foundation works, authorization works and documentation is updated.
