-- Durable publication intent for the PostgreSQL -> BullMQ handoff.
-- PostgreSQL remains authoritative; queue publication is retriable and idempotent.

CREATE TABLE "queue_publications" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "work_type" TEXT NOT NULL,
    "stable_job_key" TEXT NOT NULL,
    "payload_reference" TEXT,
    "status" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMPTZ,
    "accepted_at" TIMESTAMPTZ,
    "failure_code" TEXT,
    "failure_reason" TEXT,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queue_publications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "queue_publication_stable_job_unique"
ON "queue_publications" ("tenant_id", "stable_job_key");

CREATE INDEX "queue_publications_status_available_idx"
ON "queue_publications" ("status", "available_at");

CREATE INDEX "queue_publications_tenant_status_available_idx"
ON "queue_publications" ("tenant_id", "status", "available_at");

CREATE INDEX "queue_publications_aggregate_idx"
ON "queue_publications" ("aggregate_type", "aggregate_id");
