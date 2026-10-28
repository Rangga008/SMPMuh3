# PHASE 03 — SPMB ACCOUNT & REGISTRATION FLOW

## Objective
Turn the public SPMB site into a functional registration system.

## Users
- Parent/guardian
- Candidate/student
- SPMB staff/admin

## Functions
1. Parent registration
2. Login/logout
3. Password recovery
4. Parent profile
5. Candidate profile
6. Registration form
7. Document upload
8. Save draft
9. Submit
10. Application status
11. Registration number
12. Notifications
13. Applicant dashboard

## Status Flow
Configurable example:
DRAFT -> SUBMITTED -> DOCUMENT_REVIEW -> NEEDS_REVISION -> VERIFIED -> SELECTION -> ACCEPTED/REJECTED -> RE_REGISTRATION -> COMPLETED

## Documents
Use object storage. Validate type, size, filename, ownership and authorization. Private documents must never be public.

## Security
Parents may access only their own application. Staff access is permission-based. Audit important changes. Prevent duplicate submissions where applicable.

## Do Not
Do not implement a real payment gateway in this phase unless explicitly requested.

## Done When
A parent can register, create a candidate, submit an application, upload documents and securely see status.
