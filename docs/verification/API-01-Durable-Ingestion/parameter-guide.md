# Business Event Parameter Guide

## Example

```json
{
  "eventId": "evt_tc_002",
  "eventType": "AttendanceMarked",
  "publisher": {
    "moduleId": "attendance",
    "environment": "production"
  },
  "tenantId": "tenant_001",
  "aggregate": {
    "id": "student_001",
    "version": 2
  },
  "occurredAt": "2026-08-14T04:25:00Z",
  "schemaVersion": "1.0",
  "payload": {
    "studentId": "student_001",
    "attendanceStatus": "PRESENT"
  },
  "correlationId": "corr_tc_002"
}
```

## Fields in simple words

| Field | Meaning | Example / use |
|---|---|---|
| `eventId` | Unique ID of this particular event. | `evt_tc_002`; helps recognize the exact same event when it arrives again. |
| `eventType` | What actually happened. | `AttendanceMarked`, `FeePaid`, etc. Only registered event types should be accepted. |
| `publisher` | Which module/system sent the event. | `moduleId=attendance`; `environment=production`. |
| `tenantId` | Which customer/organization owns the event. | `tenant_001` could represent one college. |
| `aggregate.id` | Which business entity the event is about. | `student_001`. |
| `aggregate.version` | Which update/version of that business entity the event represents. | Version 1 → version 2 is a new state change. |
| `occurredAt` | When the business event actually happened. | Business occurrence time, which can differ from receive time. |
| `schemaVersion` | Version of the event JSON/data contract. | `1.0`; different from `aggregate.version`. |
| `payload` | Actual business data carried by the event. | `studentId` and `attendanceStatus`. |
| `correlationId` | ID used to trace one operation through logs/services. | `corr_tc_002`. |

## Memory formula

- `eventId` → Which event?
- `eventType` → What happened?
- `publisher` → Who sent it?
- `tenantId` → Which organization/customer?
- `aggregate.id` → Which business entity?
- `aggregate.version` → Which update of that entity?
- `occurredAt` → When did it happen?
- `schemaVersion` → Which event-data format?
- `payload` → What is the actual business data?
- `correlationId` → How do we trace the whole journey?

## Important distinction

`aggregate.version` is the version of the business entity/state. `schemaVersion` is the version of the event contract/JSON structure. They solve different problems.
