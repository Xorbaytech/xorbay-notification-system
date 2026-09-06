-- CreateTable
CREATE TABLE "publisher_modules" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "module_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publisher_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publisher_event_types" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL DEFAULT '1.0',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publisher_event_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publisher_modules_tenant_id_module_id_key" ON "publisher_modules"("tenant_id", "module_id");

-- CreateIndex
CREATE UNIQUE INDEX "publisher_event_types_module_id_event_type_key" ON "publisher_event_types"("module_id", "event_type");

-- AddForeignKey
ALTER TABLE "publisher_event_types" ADD CONSTRAINT "publisher_event_types_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "publisher_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
