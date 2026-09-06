# Communication & Notification Platform — Implementation

## Implementation Rule

Every implementation module must be derived from and verified against the approved architecture documentation before code is written.

Required study sequence for a module:

1. SRS
2. Relevant Business Layer decision(s)
3. Relevant HLD view(s)
4. Relevant Runtime Scenario(s)
5. Relevant API Contract(s)
6. Relevant LLD document(s)
7. Relevant DB Design document(s), when persistence is involved
8. Cross-Architecture Verification
9. Implementation
10. Unit and integration tests

## Current implementation slice

**API-01 — Business Event Ingestion (local foundation)**

Implemented so far:

- NestJS application bootstrap
- `/api/v1/events` POST endpoint
- API-01 request DTO and strict transport validation
- Publisher authentication boundary for local development
- Registered publisher module/event-type validation adapter
- Application use case behind an interface/port boundary
- API-01 acceptance response (`202 Accepted`)
- Unit tests for authentication, validation and acceptance

This is intentionally **not the complete API-01 runtime yet**. Durable composite idempotency, aggregate-version ordering, audit persistence and the asynchronous hand-off will be implemented only after their corresponding LLD/DB/runtime details are completed.

## Local setup

```bash
npm install
copy .env.example .env
npm run build
npm test
npm run start:dev
```

The API should listen on `http://localhost:3000` by default.

### Test API-01

Header:

```text
x-publisher-key: local-development-key
```

Request:

```json
{
  "eventId": "evt_01JXXXXXXXXXXXX",
  "eventType": "AttendanceMarked",
  "publisher": {
    "moduleId": "attendance",
    "environment": "production"
  },
  "tenantId": "tenant_123",
  "aggregate": {
    "id": "student_456",
    "version": 17
  },
  "occurredAt": "2026-08-10T05:30:00Z",
  "schemaVersion": "1.0",
  "payload": {
    "studentId": "student_456",
    "attendanceStatus": "ABSENT"
  },
  "correlationId": "corr_01JXXXXXXXXXXXX"
}
```

Expected response:

```http
202 Accepted
```

```json
{
  "eventId": "evt_01JXXXXXXXXXXXX",
  "status": "ACCEPTED",
  "correlationId": "corr_01JXXXXXXXXXXXX"
}
```

## Architectural Constraints

- Preserve the approved business decisions.
- Preserve explicit ownership of responsibilities.
- Follow SRP, OCP and DIP.
- Maintain high cohesion and loose coupling.
- Use interface/port based communication where specified by the LLD.
- Keep business rules independent of infrastructure/framework details where the architecture requires it.
- Do not introduce implementation decisions that contradict the approved documents.
- Do not modify the architecture documents as a shortcut for implementation.

## Implementation Sequence

Implementation proceeds module-by-module and runtime-scenario-by-runtime-scenario. Before each module is implemented, its relevant documentation is reviewed and an implementation mapping is established.
