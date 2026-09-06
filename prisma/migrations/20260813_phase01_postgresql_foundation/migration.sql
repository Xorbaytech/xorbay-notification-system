-- CreateEnum
CREATE TYPE "CommunicationStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "processed_events" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_module_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "source_event_id" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "schema_version" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_module_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "source_event_id" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "schema_version" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "CommunicationStatus" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "communication_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "provider" TEXT,
    "status" "DeliveryStatus" NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "scheduled_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_ref" TEXT,
    "status" "AttemptStatus" NOT NULL,
    "response_code" TEXT,
    "error_message" TEXT,
    "sent_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processed_event_unique"
ON "processed_events" ("tenant_id", "source_module_id", "event_type", "aggregate_id", "aggregate_version", "source_event_id");

-- CreateIndex
CREATE INDEX "processed_events_tenant_module_event_idx"
ON "processed_events" ("tenant_id", "source_module_id", "event_type");

-- CreateIndex
CREATE INDEX "processed_events_tenant_aggregate_idx"
ON "processed_events" ("tenant_id", "aggregate_id", "aggregate_version");

-- CreateIndex
CREATE UNIQUE INDEX "communication_unique"
ON "communications" ("tenant_id", "source_module_id", "event_type", "aggregate_id", "aggregate_version", "source_event_id");

-- CreateIndex
CREATE INDEX "communications_tenant_status_idx"
ON "communications" ("tenant_id", "status");

-- CreateIndex
CREATE INDEX "communications_tenant_module_event_idx"
ON "communications" ("tenant_id", "source_module_id", "event_type");

-- CreateIndex
CREATE INDEX "communications_tenant_aggregate_idx"
ON "communications" ("tenant_id", "aggregate_id", "aggregate_version");

-- CreateIndex
CREATE INDEX "deliveries_tenant_status_idx"
ON "deliveries" ("tenant_id", "status");

-- CreateIndex
CREATE INDEX "deliveries_communication_idx"
ON "deliveries" ("communication_id");

-- CreateIndex
CREATE INDEX "deliveries_tenant_communication_idx"
ON "deliveries" ("tenant_id", "communication_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_unique"
ON "attempts" ("delivery_id", "attempt_number");

-- CreateIndex
CREATE INDEX "attempts_delivery_idx"
ON "attempts" ("delivery_id");

-- CreateIndex
CREATE INDEX "attempts_tenant_status_idx"
ON "attempts" ("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "deliveries"
ADD CONSTRAINT "deliveries_communication_id_fkey"
FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts"
ADD CONSTRAINT "attempts_delivery_id_fkey"
FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
