import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaQueuePublicationRepository } from '../repositories/prisma-queue-publication.repository';

const loadLocalDatabaseUrl = (): void => {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find((entry) => entry.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
  process.env.DATABASE_URL = line.slice(line.indexOf('=') + 1).trim().replace(/^['\"]|['\"]$/g, '');
};

describe('Queue publication persistence', () => {
  let prisma: PrismaClient;
  let repository: PrismaQueuePublicationRepository;

  beforeAll(() => {
    loadLocalDatabaseUrl();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    repository = new PrismaQueuePublicationRepository(prisma);
  });

  afterAll(async () => prisma.$disconnect());

  it('persists publication intent with a tenant-scoped stable job identity', async () => {
    const id = randomUUID();
    const now = new Date('2026-08-14T05:00:00.000Z');
    const record = await repository.create({
      id,
      tenantId: `tenant_${id}`,
      aggregateType: 'Delivery',
      aggregateId: randomUUID(),
      workType: 'DELIVERY_EXECUTION',
      stableJobKey: `delivery:${id}`,
      payloadReference: null,
      status: 'PENDING',
      attemptCount: 0,
      availableAt: now,
      lastAttemptAt: null,
      acceptedAt: null,
      failureCode: null,
      failureReason: null,
      correlationId: `corr_${id}`,
      createdAt: now,
      updatedAt: now,
    });

    expect(record.stableJobKey).toBe(`delivery:${id}`);
    expect(record.status).toBe('PENDING');

    await prisma.queuePublication.delete({ where: { id } });
  });

  it('prevents duplicate publication for the same tenant and stable job key', async () => {
    const id = randomUUID();
    const now = new Date('2026-08-14T05:01:00.000Z');
    const base = {
      tenantId: `tenant_${id}`,
      aggregateType: 'Delivery',
      aggregateId: randomUUID(),
      workType: 'DELIVERY_EXECUTION',
      stableJobKey: `delivery:${id}`,
      payloadReference: null,
      status: 'PENDING',
      attemptCount: 0,
      availableAt: now,
      lastAttemptAt: null,
      acceptedAt: null,
      failureCode: null,
      failureReason: null,
      correlationId: `corr_${id}`,
      createdAt: now,
      updatedAt: now,
    };

    await repository.create({ id, ...base });

    await expect(repository.create({ id: randomUUID(), ...base })).rejects.toBeTruthy();
    await prisma.queuePublication.delete({ where: { id } });
  });

  it('claims one due publication and transitions it to SUBMITTING', async () => {
    const id = randomUUID();
    const now = new Date('2026-08-14T05:02:00.000Z');
    await repository.create({
      id,
      tenantId: `tenant_${id}`,
      aggregateType: 'Delivery',
      aggregateId: randomUUID(),
      workType: 'DELIVERY_EXECUTION',
      stableJobKey: `delivery:${id}`,
      payloadReference: null,
      status: 'PENDING',
      attemptCount: 0,
      availableAt: now,
      lastAttemptAt: null,
      acceptedAt: null,
      failureCode: null,
      failureReason: null,
      correlationId: `corr_${id}`,
      createdAt: now,
      updatedAt: now,
    });

    const claimed = await repository.claimNext(now);

    expect(claimed?.id).toBe(id);
    expect(claimed?.status).toBe('SUBMITTING');
    expect(claimed?.attemptCount).toBe(1);

    await prisma.queuePublication.delete({ where: { id } });
  });

  it('atomically claims a bounded batch and accepts it in one update', async () => {
    const now = new Date('2026-08-14T05:03:00.000Z');
    const ids = [randomUUID(), randomUUID(), randomUUID()];

    for (const [index, id] of ids.entries()) {
      await repository.create({
        id,
        tenantId: `tenant_${id}`,
        aggregateType: 'Delivery',
        aggregateId: randomUUID(),
        workType: 'DELIVERY_EXECUTION',
        stableJobKey: `delivery:${id}`,
        payloadReference: null,
        status: 'PENDING',
        attemptCount: 0,
        availableAt: now,
        lastAttemptAt: null,
        acceptedAt: null,
        failureCode: null,
        failureReason: null,
        correlationId: `corr_${id}`,
        createdAt: new Date(now.getTime() + index),
        updatedAt: now,
      });
    }

    const claimed = await repository.claimNextBatch!(now, 2);
    expect(claimed).toHaveLength(2);
    expect(claimed.every((record) => record.status === 'SUBMITTING')).toBe(true);
    expect(claimed.every((record) => record.attemptCount === 1)).toBe(true);

    await repository.markAcceptedMany!(claimed.map((record) => record.id), now);
    const accepted = await prisma.queuePublication.findMany({
      where: { id: { in: claimed.map((record) => record.id) } },
    });
    expect(accepted.every((record) => record.status === 'ACCEPTED')).toBe(true);

    await prisma.queuePublication.deleteMany({ where: { id: { in: ids } } });
  });
});
