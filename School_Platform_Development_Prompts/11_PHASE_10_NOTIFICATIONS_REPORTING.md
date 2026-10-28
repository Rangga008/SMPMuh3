# PHASE 10 — NOTIFICATIONS & REPORTING

## Objective
Create reusable communication and reporting infrastructure.

## Notifications
Architecture for:
- in-app
- email
- WhatsApp/SMS later if approved
- event-driven notifications

Use queues for asynchronous work.

## Reporting
Reusable reporting for:
- students
- SPMB
- payments
- attendance
- academics
- HR
- finance
- CBT analytics

Reports must respect permissions.

Exports:
- CSV
- Excel where useful
- PDF where useful

Do not generate huge reports synchronously when background jobs are more appropriate.

## Done When
Notifications and reporting are reusable across modules.
