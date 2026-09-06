# Communication Module Map

This implementation follows the canonical NestJS ownership structure shown in the LLD-01 folder-structure diagram.

## Runtime flow

```text
Business Event
    ↓
Gateway
    ↓
Validation
    ↓
Business Significance
    ↓
Policy
    ↓
Recipient
    ↓
Preference / Channels
    ↓
Template
    ↓
Personalization
    ↓
Planning
    ↓
Scheduler
    ↓
Priority
    ↓
Execution
    ↓
Providers
```

## Physical ownership

- `gateway/` — ingress controllers, services, DTOs, interfaces and events.
- `validation/` — authentication, authorization, registry, contract and idempotency boundaries.
- `business/` — business significance, policy and lifecycle responsibilities.
- `recipient/` — recipient resolution, preferences, entities and DTOs.
- `template/` — template engine, builders, templates and personalization.
- `planning/` — planner, scheduler, priority and future escalation responsibilities.
- `execution/` — dispatcher, workers, retry and DLQ responsibilities.
- `providers/` — external provider integrations such as push, email, SMS and WhatsApp.
- `repositories/` — persistence-facing repository implementation boundary.
- `audit/` — audit actions and decisions.
- `infrastructure/` — BullMQ, Redis, database, cache, configuration and framework adapters.
- `common/` — genuinely shared constants, enums, exceptions, interfaces, types and utilities.

## Current implementation mapping

```text
business/significance/     → implemented
business/policy/           → implemented
business/lifecycle/        → communication orchestration
recipient/                 → implemented boundary
 template/                 → implemented boundary
 template/personalization/ → implemented personalization boundary
planning/planner/          → implemented planning boundary
execution/dispatcher/      → implemented dispatch boundary
execution/workers/         → implemented worker boundary
infrastructure/bullmq/     → publication relay boundary
common/interfaces/         → shared execution/queue contracts
common/types/              → shared queue command types
```

## Important rule

Folder ownership describes **responsibility**; it does not by itself define runtime sequencing. Runtime sequencing comes from the architecture and sequence/state diagrams. Cross-module communication must use approved interfaces/ports and must not bypass ownership with convenient concrete imports.

Only implemented architectural slices are populated with active code. Future modules remain explicit placeholders until their relevant contracts are frozen/defined and implemented. Open decisions remain tracked rather than invented.
