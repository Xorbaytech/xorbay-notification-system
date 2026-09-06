-- Durable queue priority for starvation protection.
ALTER TABLE "queue_publications"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 5;

CREATE INDEX "queue_publications_status_priority_available_idx"
  ON "queue_publications" ("status", "priority", "available_at");
