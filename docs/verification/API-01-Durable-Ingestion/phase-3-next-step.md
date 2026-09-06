# Phase-3 Next Implementation Slice — Business Significance

## Architecture basis

The frozen B016 decision makes Business Significance Evaluation a mandatory step before recipient resolution, policy evaluation, or delivery planning.

The approved UC-02 sequence is:

```text
Accepted Event
    ↓
Business Significance
    ↓
Policy
    ↓
Recipients
    ↓
Preferences / Channels
    ↓
Template
    ↓
Personalization
    ↓
Delivery Planning
    ↓
Persist Plan
```

B016 defines the significance evaluator as a dedicated component whose responsibility is to answer whether the business event deserves communication. It must not choose channels, resolve recipients, generate templates, schedule delivery, or send communications.

## Implemented in this slice

- `BusinessSignificancePort`
- `EvaluateBusinessSignificanceUseCase`
- `AuditPort` for the required significance decision evidence
- `ProcessCommunicationUseCase` with the significance + audit boundary
- Unit tests for `NOTIFY` and `IGNORE` decisions

## Important boundary

The evaluator implementation itself is intentionally not invented here. B016 freezes the responsibility and outcomes, but the concrete significance rules are business/domain policy that must be supplied through the port. This keeps the application layer compliant with DIP/OCP and prevents hard-coded assumptions.

Likewise, the use case is not yet wired to the HTTP ingestion request. LLD-05 explicitly defines ProcessCommunicationUseCase as an asynchronous boundary and states that the ingestion endpoint must not send notifications synchronously.

## Next architectural slices

After this boundary is verified, implement the approved downstream ports/use cases in order:

1. Policy
2. Recipient resolution
3. Preferences/channels
4. Template/content
5. Personalization
6. Delivery planning and durable persistence

Only after the asynchronous hand-off mechanism is established should the accepted ingestion path be wired to ProcessCommunicationUseCase.
