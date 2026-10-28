# PHASE 05 — OPERATIONAL DASHBOARD SHELL

## Objective
Create the foundation of the school operational application. It must support many future modules.

Domain:
`admin.smpmuh3bdg.sch.id`

## Navigation
Do not hard-code a tiny sidebar. Use a modular navigation model supporting:
- module
- submenu
- permission
- icon
- route
- feature availability

## Planned Areas
- Dashboard
- Kesiswaan
- Akademik
- Kepegawaian
- SPMB
- CBT
- Keuangan
- Operasional
- Laporan
- Integrasi
- Pengaturan

Only implement functional pages belonging to this phase. Future modules may be placeholders.

## Dashboard
Create configurable widgets for:
- student count
- employee count
- academic year
- SPMB summary
- attendance summary if available
- announcements
- quick actions

Do not invent production numbers.

## UX
- responsive
- clear hierarchy
- reusable tables
- filters
- empty/loading/error states
- tablet-friendly

## Permissions
Menus and pages must respect permissions.

## Done When
The dashboard shell can accept many future modules without redesigning navigation.
