import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaTransactionContext } from '../prisma-transaction-context';
import { ProcessedEventRecord } from '../ports/processed-event-repository.port';
import { CommunicationRecord } from '../ports/communication-repository.port';
import { DeliveryRecord } from '../ports/delivery-repository.port';
import { AttemptRecord } from '../ports/attempt-repository.port';

const loadLocalDatabaseUrl = (): void => {
  if (process.env.DATABASE_URL) return;

  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find((entry) => entry.trim().startsWith('DATABASE_URL='));

  if (!line) {
    throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
  }

  process.env.DATABASE_URL = line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
};

const now = new Date('2026-08-14T00:00:00.000Z');

const buildLifecycleRecords = (prefix: string) => {
  const communicationId = randomUUID();
  const deliveryId = randomUUID();
  const attemptId = randomUUID();
  const processedEventId = randomUUID();

  const processedEvent: ProcessedEventRecord = {
    id: processedEventId,
    tenantId: `tenant_${prefix}`,
    sourceModuleId: 'attendance',
    eventType: 'AttendanceMarked',
    sourceEventId: `evt_${prefix}`,
    aggregateId: `student_${prefix}`,
    aggregateVersion: 1,
    schemaVersion: '1.0',
    correlationId: `corr_${prefix}`,
    payload: { studentId: `student_${prefix}`, attendanceStatus: 'ABSENT' },
    status: 'ACCEPTED',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  const communication: CommunicationRecord = {
    id: communicationId,
    tenantId: processedEvent.tenantId,
    sourceModuleId: processedEvent.sourceModuleId,
    eventType: processedEvent.eventType,
    sourceEventId: processedEvent.sourceEventId,
    aggregateId: processedEvent.aggregateId,
    aggregateVersion: processedEvent.aggregateVersion,
    schemaVersion: processedEvent.schemaVersion,
    correlationId: processedEvent.correlationId,
    occurredAt: now,
    payload: processedEvent.payload,
    status: 'QUEUED',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  const delivery: DeliveryRecord = {
    id: deliveryId,
    communicationId,
    tenantId: processedEvent.tenantId,
    channel: 'EMAIL',
    recipient: `recipient_${prefix}`,
    status: 'PLANNED',
    attemptCount: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  const attempt: AttemptRecord = {
    id: attemptId,
    deliveryId,
    tenantId: processedEvent.tenantId,
    attemptNumber: 1,
    provider: 'SMTP',
    status: 'QUEUED',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  return { processedEvent, communication, delivery, attempt };
};

describe('PostgreSQL transaction lifecycle', () => {
  let prisma: PrismaClient;
  let context: PrismaTransactionContext;

  beforeAll(() => {
    loadLocalDatabaseUrl();
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    prisma = new PrismaClient({ adapter });
    context = new PrismaTransactionContext(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('commits ProcessedEvent, Communication, Delivery and Attempt atomically', async () => {
    const records = buildLifecycleRecords(`commit_${randomUUID()}`);

    await context.run(async (tx) => {
      const processed = await tx.processedEvents.createProcessingRecord(records.processedEvent);
      expect(processed.created).toBe(true);
      await tx.communications.create(records.communication);
      await tx.deliveries.create(records.delivery);
      await tx.attempts.create(records.attempt);
    });

    const [processed, communication, delivery, attempt] = await Promise.all([
      prisma.processedEvent.findUnique({ where: { id: records.processedEvent.id } }),
      prisma.communication.findUnique({ where: { id: records.communication.id } }),
      prisma.delivery.findUnique({ where: { id: records.delivery.id } }),
      prisma.attempt.findUnique({ where: { id: records.attempt.id } }),
    ]);

    expect(processed).not.toBeNull();
    expect(communication).not.toBeNull();
    expect(delivery).not.toBeNull();
    expect(attempt).not.toBeNull();

    await prisma.attempt.delete({ where: { id: records.attempt.id } });
    await prisma.delivery.delete({ where: { id: records.delivery.id } });
    await prisma.communication.delete({ where: { id: records.communication.id } });
    await prisma.processedEvent.delete({ where: { id: records.processedEvent.id } });
  });

  it('rolls back the complete lifecycle when a later write fails', async () => {
    const records = buildLifecycleRecords(`rollback_${randomUUID()}`);

    await expect(
      context.run(async (tx) => {
        await tx.processedEvents.createProcessingRecord(records.processedEvent);
        await tx.communications.create(records.communication);
        await tx.deliveries.create(records.delivery);
        await tx.attempts.create(records.attempt);
        throw new Error('forced-lifecycle-failure');
      }),
    ).rejects.toThrow('forced-lifecycle-failure');

    const [processed, communication, delivery, attempt] = await Promise.all([
      prisma.processedEvent.findUnique({ where: { id: records.processedEvent.id } }),
      prisma.communication.findUnique({ where: { id: records.communication.id } }),
      prisma.delivery.findUnique({ where: { id: records.delivery.id } }),
      prisma.attempt.findUnique({ where: { id: records.attempt.id } }),
    ]);

    expect(processed).toBeNull();
    expect(communication).toBeNull();
    expect(delivery).toBeNull();
    expect(attempt).toBeNull();
  });

  it('prevents duplicate ProcessedEvent creation for the same business identity', async () => {
    const records = buildLifecycleRecords(`duplicate_${randomUUID()}`);

    const first = await context.run((tx) => tx.processedEvents.createProcessingRecord(records.processedEvent));
    const second = await context.run((tx) => tx.processedEvents.createProcessingRecord({
      ...records.processedEvent,
      id: randomUUID(),
      correlationId: `${records.processedEvent.correlationId}_duplicate`,
    }));

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record.id).toBe(records.processedEvent.id);

    await prisma.processedEvent.delete({ where: { id: records.processedEvent.id } });
  });
});
