-- Durable provider callback idempotency ledger.
CREATE TABLE "provider_callback_events" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "delivery_id" UUID,
    "attempt_id" UUID,
    "outcome" TEXT NOT NULL,
    "payload" JSONB,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_callback_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_callback_event_unique"
ON "provider_callback_events"("tenant_id", "provider", "provider_event_id");

CREATE INDEX "provider_callback_events_tenant_id_delivery_id_idx"
ON "provider_callback_events"("tenant_id", "delivery_id");
