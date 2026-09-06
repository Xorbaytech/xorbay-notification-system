-- CreateTable
CREATE TABLE "significance_rules" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_module_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "significance_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_rules" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_module_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "template_identity" TEXT,
    "template_version" INTEGER,
    "reason" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "significance_rules_tenant_id_source_module_id_event_type_is_idx" ON "significance_rules"("tenant_id", "source_module_id", "event_type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "significance_rules_tenant_id_source_module_id_event_type_key" ON "significance_rules"("tenant_id", "source_module_id", "event_type");

-- CreateIndex
CREATE INDEX "policy_rules_tenant_id_source_module_id_event_type_is_activ_idx" ON "policy_rules"("tenant_id", "source_module_id", "event_type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "policy_rules_tenant_id_source_module_id_event_type_key" ON "policy_rules"("tenant_id", "source_module_id", "event_type");
