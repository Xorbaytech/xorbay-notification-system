-- CreateTable
CREATE TABLE "templates" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_module_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipients" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_module_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferences" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "source_module_id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "templates_tenant_id_source_module_id_event_type_idx" ON "templates"("tenant_id", "source_module_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "templates_tenant_id_source_module_id_event_type_identity_ve_key" ON "templates"("tenant_id", "source_module_id", "event_type", "identity", "version");

-- CreateIndex
CREATE INDEX "recipients_tenant_id_source_module_id_idx" ON "recipients"("tenant_id", "source_module_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipients_tenant_id_source_module_id_recipient_id_key" ON "recipients"("tenant_id", "source_module_id", "recipient_id");

-- CreateIndex
CREATE INDEX "preferences_tenant_id_source_module_id_recipient_id_idx" ON "preferences"("tenant_id", "source_module_id", "recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "preferences_tenant_id_source_module_id_recipient_id_channel_key" ON "preferences"("tenant_id", "source_module_id", "recipient_id", "channel");
