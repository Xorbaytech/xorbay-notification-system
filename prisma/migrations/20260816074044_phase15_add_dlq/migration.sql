-- CreateTable
CREATE TABLE "dead_letter_records" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "communication_id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "failure_code" TEXT,
    "failure_reason" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dead_letter_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dead_letter_records_tenant_id_created_at_idx" ON "dead_letter_records"("tenant_id", "created_at");
