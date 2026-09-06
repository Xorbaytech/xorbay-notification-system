CREATE TABLE "audit_records" (
    "audit_id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "communication_id" UUID,
    "delivery_id" UUID,
    "attempt_id" UUID,
    "correlation_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_reference" TEXT,
    "previous_state" TEXT,
    "new_state" TEXT,
    "decision" TEXT,
    "reason_code" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_records_pkey" PRIMARY KEY ("audit_id")
);

CREATE INDEX "audit_records_communication_id_created_at_idx" ON "audit_records"("communication_id", "created_at");
CREATE INDEX "audit_records_delivery_id_created_at_idx" ON "audit_records"("delivery_id", "created_at");
CREATE INDEX "audit_records_correlation_id_created_at_idx" ON "audit_records"("correlation_id", "created_at");
CREATE INDEX "audit_records_tenant_id_created_at_idx" ON "audit_records"("tenant_id", "created_at");

ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
