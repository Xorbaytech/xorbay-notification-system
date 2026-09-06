-- Phase 16: durable campaign and batch grouping for bulk broadcasts.
-- This migration is additive and keeps the existing communication/delivery
-- execution path intact.

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "source_module_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "communication_id" UUID,
  "idempotency_key" TEXT,
  "template_identity" TEXT NOT NULL,
  "template_version" INTEGER NOT NULL DEFAULT 1,
  "channel" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "total_recipients" INTEGER NOT NULL,
  "total_batches" INTEGER NOT NULL,
  "completed_batches" INTEGER NOT NULL DEFAULT 0,
  "failed_batches" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "broadcast_batches" (
  "id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "batch_number" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "recipient_count" INTEGER NOT NULL,
  "queued_count" INTEGER NOT NULL DEFAULT 0,
  "accepted_count" INTEGER NOT NULL DEFAULT 0,
  "delivered_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "idempotency_key" TEXT NOT NULL,
  "queue_accepted_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "broadcast_batches_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "communications"
  ADD COLUMN IF NOT EXISTS "campaign_id" UUID;

ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "batch_id" UUID;

ALTER TABLE "queue_publications"
  ADD COLUMN IF NOT EXISTS "batch_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_idempotency_unique"
  ON "campaigns" ("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "campaigns_tenant_id_status_created_at_idx"
  ON "campaigns" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "campaigns_tenant_id_communication_id_idx"
  ON "campaigns" ("tenant_id", "communication_id");

CREATE UNIQUE INDEX IF NOT EXISTS "campaign_batch_number_unique"
  ON "broadcast_batches" ("campaign_id", "batch_number");
CREATE UNIQUE INDEX IF NOT EXISTS "batch_idempotency_unique"
  ON "broadcast_batches" ("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "broadcast_batches_tenant_id_status_created_at_idx"
  ON "broadcast_batches" ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "broadcast_batches_campaign_id_status_idx"
  ON "broadcast_batches" ("campaign_id", "status");

CREATE INDEX IF NOT EXISTS "deliveries_batch_id_idx"
  ON "deliveries" ("batch_id");
CREATE INDEX IF NOT EXISTS "queue_publications_tenant_id_batch_id_status_idx"
  ON "queue_publications" ("tenant_id", "batch_id", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communications_campaign_id_fkey') THEN
    ALTER TABLE "communications"
      ADD CONSTRAINT "communications_campaign_id_fkey"
      FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'broadcast_batches_campaign_id_fkey') THEN
    ALTER TABLE "broadcast_batches"
      ADD CONSTRAINT "broadcast_batches_campaign_id_fkey"
      FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_batch_id_fkey') THEN
    ALTER TABLE "deliveries"
      ADD CONSTRAINT "deliveries_batch_id_fkey"
      FOREIGN KEY ("batch_id") REFERENCES "broadcast_batches"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'queue_publications_batch_id_fkey') THEN
    ALTER TABLE "queue_publications"
      ADD CONSTRAINT "queue_publications_batch_id_fkey"
      FOREIGN KEY ("batch_id") REFERENCES "broadcast_batches"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
