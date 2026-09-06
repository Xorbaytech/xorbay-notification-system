-- M013: Recurring ScheduledOccurrence support
-- Adds scheduled_delivery_plans and scheduled_occurrences tables per SPEC-009 §5.
-- These tables are the authoritative scheduler state; queue state is not lifecycle truth.

-- CreateTable: scheduled_delivery_plans
CREATE TABLE "scheduled_delivery_plans" (
    "scheduled_plan_id" UUID NOT NULL,
    "tenant_id"          TEXT NOT NULL,
    "delivery_id"        UUID NOT NULL,
    "mode"               TEXT NOT NULL,   -- ONE_SHOT | RECURRING
    "scheduled_at"       TIMESTAMPTZ,
    "cron_expression"    TEXT,
    "timezone"           TEXT NOT NULL,   -- IANA timezone, validated at request time
    "starts_at"          TIMESTAMPTZ,
    "next_occurrence_at" TIMESTAMPTZ,
    "expires_at"         TIMESTAMPTZ,
    "status"             TEXT NOT NULL,   -- SCHEDULED | CANCELLED | EXPIRED | COMPLETED
    "schedule_version"   INTEGER NOT NULL DEFAULT 1,
    "correlation_id"     TEXT NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_delivery_plans_pkey" PRIMARY KEY ("scheduled_plan_id")
);

-- CreateTable: scheduled_occurrences
-- UNIQUE(scheduled_plan_id, occurrence_at) is the authoritative occurrence identity
-- per SPEC-009 §5: "DB unique constraint is authoritative"
CREATE TABLE "scheduled_occurrences" (
    "occurrence_id"      UUID NOT NULL,
    "scheduled_plan_id"  UUID NOT NULL,
    "occurrence_at"      TIMESTAMPTZ NOT NULL,
    "status"             TEXT NOT NULL,   -- PENDING | CLAIMED | RELEASED | MISSED | EXPIRED
    "schedule_version"   INTEGER NOT NULL,
    "claimed_at"         TIMESTAMPTZ,
    "released_at"        TIMESTAMPTZ,
    "publication_id"     UUID,
    "version"            INTEGER NOT NULL DEFAULT 1,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_occurrences_pkey" PRIMARY KEY ("occurrence_id")
);

-- UniqueIndex: occurrence identity = scheduledPlanId + occurrenceAt
CREATE UNIQUE INDEX "occurrence_unique"
ON "scheduled_occurrences" ("scheduled_plan_id", "occurrence_at");

-- Indexes: due-occurrence lookup (tenant/status/time) per SPEC-009 §5
CREATE INDEX "scheduled_delivery_plans_tenant_status_next_idx"
ON "scheduled_delivery_plans" ("tenant_id", "status", "next_occurrence_at");

CREATE INDEX "scheduled_delivery_plans_tenant_delivery_idx"
ON "scheduled_delivery_plans" ("tenant_id", "delivery_id");

CREATE INDEX "scheduled_occurrences_status_time_idx"
ON "scheduled_occurrences" ("status", "occurrence_at");

CREATE INDEX "scheduled_occurrences_plan_status_idx"
ON "scheduled_occurrences" ("scheduled_plan_id", "status");

-- ForeignKey: occurrences reference their plan
ALTER TABLE "scheduled_occurrences"
ADD CONSTRAINT "scheduled_occurrences_scheduled_plan_id_fkey"
FOREIGN KEY ("scheduled_plan_id") REFERENCES "scheduled_delivery_plans"("scheduled_plan_id") ON DELETE RESTRICT ON UPDATE CASCADE;
