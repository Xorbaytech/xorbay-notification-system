# Architecture → Implementation Tracker

Branch: `feature/phase-2-durable-ingestion`

## Purpose

This tracker records the implementation state against the approved architecture and freeze documents. It is intentionally separate from runtime flow documentation.

Rules:

- **FROZEN / DEFINED**: verify the relevant documents first, then implement only the documented contract.
- **OPEN**: track the item; do not invent business rules.
- **NOT FOUND**: track it as an architecture gap until the authoritative documents define it.
- **IMPLEMENTED** does not mean production-complete; API/runtime verification is tracked separately.
- Every completed API/runtime slice must have explicit verification evidence.
- The LLD-01 embedded folder-structure diagram is the canonical physical NestJS ownership reference.

## Required workflow for every next slice

1. Read all relevant DOCX / architecture / freeze documents.
2. Identify the authoritative contract and ownership.
3. Inspect the current GitHub implementation.
4. Record gaps and open decisions.
5. Produce an implementation plan.
6. Implement without inventing open business rules.
7. Run unit tests.
8. Run build.
9. Run integration / PostgreSQL tests where applicable.
10. Run API/runtime verification where an API or runtime path exists.
11. Update this tracker with implementation and verification status.
12. Move to the next relevant frozen/defined item.

## Current implementation status

| Area | Architecture status | Code status | Verification status | Notes |
|---|---|---|---|---|
| Durable ingestion / API-01 | Frozen/defined | Implemented | API tests + unit/integration verification completed | Includes schema/auth/registration/idempotency paths already exercised. |
| Persistence / transaction boundary | Frozen/defined | Implemented | PostgreSQL integration green | Commit, rollback and duplicate identity behavior verified before current structure refactor. |
| Business significance | Frozen/defined | Implemented | Unit tests green | Owned by `business/significance`. |
| Business significance audit | Frozen/defined | Durable persistence adapter implemented | Unit + PostgreSQL verification completed | Audit boundary now writes reconstructable business-significance decisions to `audit_records`; no open runtime event vocabulary was invented. |
| Policy | Frozen/defined | Implemented | Unit tests green | Owned by `business/policy`. |
| Recipient resolution boundary | Defined | Boundary implemented | Unit tests green | No concrete ERP/User DB invented. |
| Fake recipient resolver | **FROZEN** by SPEC-003/SPEC-004 | Implemented in `recipient/fakes`; tenant/module-scoped fixture wiring added | Unit/build/integration/E2E verification green | Deterministic fixture source only; no ERP/User DB semantics invented. |
| Preference resolution | Boundary defined; concrete source/rules open | Boundary implemented | Unit tests green | No concrete preference source invented. |
| Template/content resolution | Boundary defined; concrete source/details open | Boundary implemented | Unit tests green | No provider-specific behavior invented. |
| Personalization | Responsibility/port defined; concrete rules/source open | Moved to `template/personalization` | Unit tests green after structure refactor | Open business personalization rules remain tracked. |
| Delivery planning | Responsibility/port defined; concrete planning rules open | Moved to `planning/planner` | Unit tests green after structure refactor | Durable persistence/handoff remains a separate slice. |
| Queue execution boundary | Frozen/defined | Moved into `execution` / `common` boundaries | Unit tests + build + integration green after structure refactor | Queue remains execution infrastructure; no provider behavior is included. |
| Durable DB → Queue publication | **FROZEN** by final architecture review | Persistence + transactional outbox implemented | PostgreSQL integration green | Transactional publication intent + stable tenant-scoped job identity. |
| Publication Relay | **FROZEN** by final architecture review | Moved to `infrastructure/bullmq` | Unit tests green after structure refactor | Claims durable publications, builds frozen `QueueCommand`, reconciles ambiguous acceptance, and marks controlled recovery. |
| Worker delivery-job boundary | **FROZEN / DEFINED** by LLD-05/LLD-06/ARCH-02 | Moved to `execution/workers` | Unit tests green after structure refactor | Worker validates delivery work type and delegates to the Dispatch Delivery boundary. |
| Dispatch Delivery orchestration | **DEFINED** by LLD-05/LLD-06/ARCH-02 | Moved to `execution/dispatcher`; atomic claim + attempt creation + provider registry routing added | Unit/build/integration verified green | Re-resolves authoritative delivery context, uses optimistic version claim, creates the processing Attempt inside the transaction, resolves the provider through the registry, and then delegates provider dispatch. Provider implementation/retry/fallback remain separate. |
| Delivery / Attempt repository operations | **DEFINED** by LLD-03/LLD-04/LLD-05/LLD-06 + Phase 2 roadmap | Extended ports + Prisma adapters + optimistic execution claim implemented | Verification green after local unit/build/integration run | Adds tenant-scoped lookup, status filtering, delivery update, attempt history/latest lookup, and atomic `version`-guarded execution claim. |
| Stale `PROCESSING` delivery recovery | **DEFINED** by LLD-03/LLD-06 + Phase 2 restart-safety gate | Implemented as bounded cron + version-safe recovery use case; reuses retry/DLQ/outbox ports | 52 suites / 204 tests, build, lint, Prisma validation, and live DB reconciliation green | `DELIVERY_PROCESSING_TIMEOUT_MS` and `DELIVERY_RECOVERY_BATCH_SIZE` are bounded; recovery decisions are exported through `communication_delivery_recoveries_total`. |
| Delivery execution outcome persistence | **DEFINED boundary; concrete provider outcome source remains separate** | Implemented in `execution/dispatcher` + `common/interfaces` | Unit/build/integration green from latest local verification | Transactionally persists normalized SENT/DELIVERED/FAILED/CANCELLED outcome to Attempt and Delivery; does not implement provider SDK, retry, fallback, callback, or new business rules. |
| Runtime orchestration | Defined by architecture | End-to-end runtime test added | **Unit/build/integration verified green** | Test composes worker → dispatch → authoritative claim → provider boundary test double → normalized outcome persistence; no production provider behavior introduced. |
| Provider registry / route resolution | **DEFINED** by LLD-07 | Implemented in `providers/ports` + `providers/registry`; wired through `ProviderModule` and Dispatch Delivery | **Unit/build/integration verified green** | Registry resolves a provider-independent dispatch adapter by channel/provider route. No concrete provider behavior is embedded in the registry. |
| Fake provider adapters | **FROZEN** by SPEC-002 / SPEC-003 | Implemented for Email/SMS/Push with deterministic outcomes + configurable latency; registered through `ProviderModule` | **Unit/build/integration verified green** | Real providers remain deferred. Adapter result vocabulary stays provider-independent; retry/fallback remains outside the adapter. |
| Canonical NestJS folder structure | **FROZEN by LLD-01 diagram** | Refactored | Unit/build/integration green after refactor | Active slices follow `business`, `recipient`, `template`, `planning`, `execution`, `providers`, `repositories`, `infrastructure`, and `common` ownership. |
| API/runtime verification framework | Required | Implemented for current MVP slices | API, unit, PostgreSQL integration, E2E and build verification green | Real provider credentials and external ERP recipient sources remain environment-dependent. |

## Architecture gaps / open items

| Item | Status | Action |
|---|---|---|
| Concrete recipient source / ERP integration | DEFERRED for MVP; fake source is frozen | Keep ERP integration behind the existing recipient port; do not introduce an external system during MVP. |
| Concrete preference source and business rules | OPEN / fake implementation frozen | Implement deterministic allow/deny fixture adapter next; do not invent external preference source. |
| Concrete template repository/version selection | OPEN / fake implementation frozen | Implement PostgreSQL-backed deterministic template fixture repository next; do not invent external repository semantics. |
| Concrete personalization rules/data source | OPEN / deterministic fake frozen | Implement deterministic local adapter using explicit template variables only. |
| Concrete delivery planning rules | OPEN / phase-dependent | Verify relevant architecture/freeze docs before implementation. |
| BullMQ/Redis infrastructure configuration | OPEN / implementation detail | Add only when queue adapter/operational configuration is implemented from the relevant LLD/runtime contract. |
| Worker authoritative Delivery/Attempt execution adapter | DEFINED / implemented | Worker re-resolves authoritative Delivery state and protects transitions through delivery/attempt repositories; runtime orchestration verifies the boundary. |
| Real Email/SMS/Push providers | DEFERRED by SPEC-003 | Do not add vendor SDKs during MVP. Replace fake adapters only in a later integration phase behind the same provider boundary. |
| Provider-specific contracts beyond the frozen fake-provider test matrix | PHASE-DEPENDENT | Add only when a real provider integration is explicitly approved; do not introduce vendor semantics into core. |
| Scheduler implementation details | FROZEN MVP; implementation pending | Implement exact frozen scheduler release semantics after source contract verification. |
| Priority implementation details | FROZEN MVP; implementation pending | Implement exact frozen MVP priority semantics after source contract verification. |
| Retry/DLQ behavior | FROZEN MVP configuration; implementation pending | Implement exact SPEC-003 values after provider-result integration is ready; do not invent alternative retry rules. |
| Observability details | FROZEN MVP baseline | Durable outbox queue-depth and stale-recovery decision metrics are implemented through repository/cron boundaries; structured logs/correlation remain in the existing runtime baseline. |
| Runtime audit event vocabulary / exact TypeScript audit contract | OPEN in source LLD | Track; durable audit storage foundation is implemented, but do not invent the remaining runtime event vocabulary until finalized. |

## API verification rule

For every API/runtime slice, record all of the following before marking it complete:

- Request/response contract checked against the authoritative document.
- Happy path verified.
- Validation/error paths verified where specified.
- Authentication/authorization behavior verified where applicable.
- Idempotency/concurrency behavior verified where applicable.
- Persistence state checked where applicable.
- Unit tests pass.
- Build passes.
- Integration tests pass where applicable.

## Latest verification state

The provider-registry, fake-provider, fake-recipient, durable publication, worker execution, stale-delivery recovery, and API/runtime slices are verified green locally. The latest verification record is in `runtime-architecture-audit.md`; the ERP backend also passes its complete local unit suite and production build. Real provider activation and frontend production environment injection remain deployment-time work.

## Release-gate snapshot (31 August 2026)

The current local release candidate additionally passes 48 unit suites/189 tests, 4 PostgreSQL integration suites/10 tests, 5 API E2E suites/24 tests, ESLint, Prisma validation, and both backend builds. Redis configuration is shared by BullMQ and provider-rate limiting, supports authenticated `REDIS_URL`/`rediss://`, and Nest shutdown hooks are enabled for graceful worker release. A 10,000-recipient durable fan-out completed with 10,000 `SENT`, zero failed and zero duplicate deliveries; the 37-event regression completed with 32/32 accepted hooks and 75/75 sent attempts using the approved fake providers. See [`37_EVENT_AND_HEAVY_BROADCAST_TEST_REPORT.md`](../../../../37_EVENT_AND_HEAVY_BROADCAST_TEST_REPORT.md) and `docs/verification/production-rollback-runbook.md` for evidence and operational recovery steps.

The frontend production build intentionally refuses to run until the deployment environment supplies non-placeholder `VITE_API_URL` and `VITE_APP_HOSTS`. This is a deployment safety gate, not an application-code failure. Real Email/SMS/WhatsApp provider activation remains intentionally deferred; the in-app path is the only live provider in this release scope.
