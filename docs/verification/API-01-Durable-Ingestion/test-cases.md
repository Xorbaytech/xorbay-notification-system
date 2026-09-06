# API-01 Runtime Test Cases

## Status

**9 runtime scenarios PASS** at this checkpoint.

| ID | Scenario | Test | Expected / observed | Result |
|---|---|---|---|---|
| TC-01 | Valid ingestion | Valid `AttendanceMarked` event with valid publisher | `202 ACCEPTED`; `ProcessedEvent` persisted | PASS |
| TC-02 | Sequential duplicate | Same event sent twice | Only one durable `ProcessedEvent` row | PASS |
| TC-03 | Concurrent duplicate | Two identical events sent concurrently | Both returned `202`; exactly one `evt_concurrent_001` row | PASS |
| TC-04 | Invalid aggregate version | `aggregate.version = 0` | `EVENT_SCHEMA_INVALID`; no durable row | PASS |
| TC-05 | Publisher authentication failure | Valid event with wrong publisher key | `PUBLISHER_AUTHENTICATION_FAILED` | PASS |
| TC-06 | Unregistered event type | `eventType = CompletelyUnknownEvent` | `EVENT_TYPE_NOT_REGISTERED` | PASS |
| TC-07 | Unregistered publisher module | Valid key, `moduleId = unknown-module` | `MODULE_NOT_REGISTERED` | PASS |
| TC-08 | Rejected-event persistence invariant | Checked `ProcessedEvent` after rejected requests | Rejected event IDs absent; only valid rows remained | PASS |
| TC-09 | New aggregate version | Same `student_001`, version 1 → 2, new `eventId` | `202 ACCEPTED`; new durable row | PASS |

## Database observations

Valid rows observed in Prisma Studio included:

- `evt_tc_001`
- `evt_concurrent_001`
- `evt_tc_002`

Rejected IDs checked for absence included:

- `evt_invalid_001`
- `evt_unknown_type_001`
- `evt_unapproved_publisher_001`

## Test principle

A successful HTTP response alone is not sufficient evidence. The durable state in PostgreSQL was also checked for the idempotency and persistence-invariant tests.
