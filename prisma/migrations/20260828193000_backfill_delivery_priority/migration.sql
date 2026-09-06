-- Backfill priority for publications created before durable priority existed.
-- This is idempotent and does not delete or recreate delivery records.
UPDATE "queue_publications" qp
SET "priority" = 1
FROM "deliveries" d
JOIN "communications" c ON c.id = d.communication_id
WHERE qp.aggregate_id = d.id::text
  AND qp."priority" = 5
  AND c.event_type IN (
    'AttendanceMarked', 'FeeInvoiceGenerated', 'FeePaymentFailed',
    'FeeReminder', 'FeeOverdue', 'FeePaymentLinkGenerated',
    'SubscriptionExpiring', 'TeacherAssigned', 'TeacherAddedToBatch',
    'TeacherWelcome', 'StudentAdmissionTeacher', 'TimetableUpdated',
    'TimetableSlotRemoved', 'ClassStartingSoon'
  );

UPDATE "queue_publications"
SET "priority" = 8
WHERE "priority" = 5
  AND "stable_job_key" LIKE 'broadcast:%';
