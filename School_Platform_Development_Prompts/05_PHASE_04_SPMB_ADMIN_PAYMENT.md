# PHASE 04 — SPMB ADMIN, VERIFICATION & PAYMENT

## Objective
Build the operational side of SPMB and prepare real payment integration.

## Admin
- applicant list
- search/filter
- applicant detail
- document verification
- request revision
- approval
- selection
- announcement
- registration settings
- requirements
- timeline
- fees
- reporting/export

## Payment Domain
Design:
- Invoice
- Payment
- PaymentMethod
- PaymentStatus
- PaymentCallback/Webhook
- Receipt

Use explicit states and idempotency. Never store card credentials.

## Provider Architecture
Create a payment provider adapter/interface so the provider can be changed without rewriting SPMB.

Conceptually:
- createInvoice
- checkStatus
- handleWebhook
- refund if supported

## Webhooks
- verify signature
- validate event
- idempotency
- audit
- safe retry

## Parent
Parent can:
- view fee
- view invoice
- see payment status
- receive confirmation
- access receipt where appropriate

## Done When
SPMB staff can process applications and payment architecture is ready for a real provider.
