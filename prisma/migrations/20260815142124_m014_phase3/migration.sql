-- AlterTable
ALTER TABLE "attempts" ALTER COLUMN "sent_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "communications" ALTER COLUMN "occurred_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "deliveries" ALTER COLUMN "scheduled_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "sent_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "processed_events" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "queue_publications" ALTER COLUMN "available_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_attempt_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "accepted_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "scheduled_delivery_plans" ALTER COLUMN "scheduled_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "starts_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "next_occurrence_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "scheduled_occurrences" ALTER COLUMN "occurrence_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "claimed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "released_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- RenameIndex
ALTER INDEX "attempt_unique" RENAME TO "attempts_delivery_id_attempt_number_key";

-- RenameIndex
ALTER INDEX "attempts_delivery_idx" RENAME TO "attempts_delivery_id_idx";

-- RenameIndex
ALTER INDEX "attempts_tenant_status_idx" RENAME TO "attempts_tenant_id_status_idx";

-- RenameIndex
ALTER INDEX "communication_unique" RENAME TO "communications_tenant_id_source_module_id_event_type_aggreg_key";

-- RenameIndex
ALTER INDEX "communications_tenant_aggregate_idx" RENAME TO "communications_tenant_id_aggregate_id_aggregate_version_idx";

-- RenameIndex
ALTER INDEX "communications_tenant_module_event_idx" RENAME TO "communications_tenant_id_source_module_id_event_type_idx";

-- RenameIndex
ALTER INDEX "communications_tenant_status_idx" RENAME TO "communications_tenant_id_status_idx";

-- RenameIndex
ALTER INDEX "deliveries_communication_idx" RENAME TO "deliveries_communication_id_idx";

-- RenameIndex
ALTER INDEX "deliveries_tenant_communication_idx" RENAME TO "deliveries_tenant_id_communication_id_idx";

-- RenameIndex
ALTER INDEX "deliveries_tenant_status_idx" RENAME TO "deliveries_tenant_id_status_idx";

-- RenameIndex
ALTER INDEX "processed_event_unique" RENAME TO "processed_events_tenant_id_source_module_id_event_type_aggr_key";

-- RenameIndex
ALTER INDEX "processed_events_tenant_aggregate_idx" RENAME TO "processed_events_tenant_id_aggregate_id_aggregate_version_idx";

-- RenameIndex
ALTER INDEX "processed_events_tenant_module_event_idx" RENAME TO "processed_events_tenant_id_source_module_id_event_type_idx";

-- RenameIndex
ALTER INDEX "queue_publication_stable_job_unique" RENAME TO "queue_publications_tenant_id_stable_job_key_key";

-- RenameIndex
ALTER INDEX "queue_publications_aggregate_idx" RENAME TO "queue_publications_aggregate_type_aggregate_id_idx";

-- RenameIndex
ALTER INDEX "queue_publications_status_available_idx" RENAME TO "queue_publications_status_available_at_idx";

-- RenameIndex
ALTER INDEX "queue_publications_tenant_status_available_idx" RENAME TO "queue_publications_tenant_id_status_available_at_idx";

-- RenameIndex
ALTER INDEX "scheduled_delivery_plans_tenant_delivery_idx" RENAME TO "scheduled_delivery_plans_tenant_id_delivery_id_idx";

-- RenameIndex
ALTER INDEX "scheduled_delivery_plans_tenant_status_next_idx" RENAME TO "scheduled_delivery_plans_tenant_id_status_next_occurrence_a_idx";

-- RenameIndex
ALTER INDEX "occurrence_unique" RENAME TO "scheduled_occurrences_scheduled_plan_id_occurrence_at_key";

-- RenameIndex
ALTER INDEX "scheduled_occurrences_plan_status_idx" RENAME TO "scheduled_occurrences_scheduled_plan_id_status_idx";

-- RenameIndex
ALTER INDEX "scheduled_occurrences_status_time_idx" RENAME TO "scheduled_occurrences_status_occurrence_at_idx";
