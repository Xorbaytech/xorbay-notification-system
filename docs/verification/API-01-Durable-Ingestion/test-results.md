# API-01 Verification Summary

## Build and startup checks

- `npm install` — PASS
- `npx prisma generate` — PASS
- `npm test -- --runInBand` — PASS: 2 suites, 8 tests
- `npm run build` — PASS
- `npm run start:dev` — PASS
- `POST /api/v1/events` route mapped successfully

## Runtime verification

The following boundaries were verified with Thunder Client and Prisma Studio:

1. Valid event is accepted and durably persisted.
2. Sequential duplicate does not create a second `ProcessedEvent`.
3. Concurrent duplicate requests both returned `202`, while exactly one durable row existed for the concurrent event.
4. Invalid aggregate version is rejected with `EVENT_SCHEMA_INVALID`.
5. Invalid publisher key is rejected with `PUBLISHER_AUTHENTICATION_FAILED`.
6. Unknown event type is rejected with `EVENT_TYPE_NOT_REGISTERED`.
7. Unregistered publisher module is rejected with `MODULE_NOT_REGISTERED`.
8. Rejected events were not present in `ProcessedEvent`.
9. A new aggregate version with a new event ID is accepted as a new event.

## Verified runtime boundary

```text
Publisher
  ↓
Authentication
  ↓
Module registration
  ↓
Event/schema validation
  ↓
Event-type registration
  ↓
Idempotency / duplicate protection
  ↓
Transaction
  ↓
Durable ProcessedEvent
  ↓
202 ACCEPTED
```

## Important limitation

This report verifies the current durable-ingestion boundary only. It is not a claim that the entire Notification System architecture is implemented. Downstream communication creation, delivery planning, attempts, provider delivery, queue/outbox behavior, asynchronous workers and failure/retry flows still require architectural verification.

## Evidence source

Manual runtime evidence was obtained from the local NestJS application, Thunder Client responses, and Prisma Studio database state. No secrets or `.env` values are included in this documentation.
