-- Rename DeliveryStatus enum value PENDING to PLANNED (SPEC-009 §7 fix)
-- Add RETRYING to DeliveryStatus for retry lifecycle (LLD-03 §9)

-- Rename PENDING -> PLANNED
ALTER TYPE "DeliveryStatus" RENAME VALUE 'PENDING' TO 'PLANNED';

-- Add RETRYING value
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'RETRYING';
