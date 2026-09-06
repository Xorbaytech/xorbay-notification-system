-- Keep fallback limits independent for every logical recipient/channel chain.
ALTER TABLE "deliveries"
  ADD COLUMN IF NOT EXISTS "fallback_of_delivery_id" UUID;

CREATE INDEX IF NOT EXISTS "deliveries_communication_recipient_idx"
  ON "deliveries" ("communication_id", "recipient");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deliveries_fallback_of_delivery_id_fkey'
  ) THEN
    ALTER TABLE "deliveries"
      ADD CONSTRAINT "deliveries_fallback_of_delivery_id_fkey"
      FOREIGN KEY ("fallback_of_delivery_id") REFERENCES "deliveries"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
