# API-01 — Durable Ingestion Verification

This folder is the verification record for the Phase-2 durable-ingestion boundary.

## Scope

The verified runtime boundary is:

Publisher → Authentication → Module registration → Event/schema validation → Event-type registration → Idempotency/duplicate protection → Transaction → Durable `ProcessedEvent` → `202 ACCEPTED`

## Documents

- `parameter-guide.md` — Business Event JSON fields explained in simple language.
- `test-cases.md` — Runtime test cases and observed results.
- `test-results.md` — Verification summary and evidence notes.

## Evidence

Runtime evidence is based on the local NestJS application, Thunder Client requests, and Prisma Studio database verification.

> This verification covers the current durable-ingestion boundary only. It does not yet prove downstream communication creation, delivery planning, attempts, provider delivery, queue/outbox, or asynchronous processing.
