# PHASE 09 — DAPODIK & ARKAS INTEGRATION

## Objective
Integrate external school systems without making them the source of every internal operation.

## Dapodik
Architecture:
external data -> fetch/import -> validate -> map -> reconcile -> internal database

Support:
- sync logs
- last successful sync
- errors
- retry
- conflict handling
- mapping
- audit

Never overwrite internal data blindly.

## ARKAS
Create a mapping/integration layer from internal finance data to ARKAS-related structures.

The application must remain usable if an external system is temporarily unavailable.

## Integration Rules
- adapters
- explicit contracts
- timeouts
- retries
- idempotency
- logs
- audit
- visible failures

Never claim an undocumented API works. If official access details are unavailable, create an adapter interface and documented placeholder.
