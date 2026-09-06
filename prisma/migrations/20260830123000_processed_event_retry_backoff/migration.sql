-- Durable retry metadata for source-of-truth recipient resolution.
-- This migration is additive and safe to run against databases that already
-- contain one or more of these columns (for example, a partially upgraded
-- local environment).
ALTER TABLE "processed_events"
  ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "next_attempt_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_error_code" TEXT,
  ADD COLUMN IF NOT EXISTS "last_error_message" TEXT;

CREATE INDEX IF NOT EXISTS "processed_events_status_next_attempt_idx"
  ON "processed_events" ("status", "next_attempt_at", "created_at");
