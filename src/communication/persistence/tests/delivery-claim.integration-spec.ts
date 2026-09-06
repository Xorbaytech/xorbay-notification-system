import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaDeliveryRepository } from '../repositories/prisma-delivery.repository';
import { PrismaAttemptRepository } from '../repositories/prisma-attempt.repository';
import { ClaimDeliveryExecutionUseCase } from '../../execution/dispatcher/claim-delivery-execution.use-case';
import { TransactionContextPort } from '../ports/transaction-context.port';

const loadLocalDatabaseUrl = (): void => {
  if (process.env.DATABASE_URL) return;
  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf8');
  const line = content.split(/\r?\n/).find((entry) => entry.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
  process.env.DATABASE_URL = line.slice(line.indexOf('=') + 1).trim().replace(/^['\"]|['\"]$/g, '');
};

describe('Delivery execution claim', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    loadLocalDatabaseUrl();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  });

  afterAll(async () => prisma.$disconnect());

  it('allows only one concurrent worker to claim the same delivery version', async () => {
    const tenantId = `tenant_${randomUUID()}`;
    const communicationId = randomUUID();
    const deliveryId = randomUUID();
    const now = new Date();

    await prisma.communication.create({
      data: {
        id: communicationId,
        tenantId,
        sourceModuleId: 'integration-test',
        eventType: 'DeliveryClaimTest',
        sourceEventId: randomUUID(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        schemaVersion: '1.0',
        correlationId: `corr_${deliveryId}`,
        occurredAt: now,
        payload: {},
        status: 'QUEUED',
        version: 1,
      },
    });

    await prisma.delivery.create({
      data: {
        id: deliveryId,
        communicationId,
        tenantId,
        channel: 'EMAIL',
        recipient: 'integration@example.com',
        provider: 'test-provider',
        status: 'QUEUED',
        attemptCount: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    });

    const repositoryA = new PrismaDeliveryRepository(prisma);
    const repositoryB = new PrismaDeliveryRepository(prisma);

    const [claimA, claimB] = await Promise.all([
      repositoryA.claimForExecution(deliveryId, tenantId, 1, new Date()),
      repositoryB.claimForExecution(deliveryId, tenantId, 1, new Date()),
    ]);

    expect([claimA, claimB].filter(Boolean)).toHaveLength(1);

    const persisted = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    expect(persisted?.status).toBe('PROCESSING');
    expect(persisted?.attemptCount).toBe(1);
    expect(persisted?.version).toBe(2);

    await prisma.delivery.delete({ where: { id: deliveryId } });
    await prisma.communication.delete({ where: { id: communicationId } });
  });

  it('creates the attempt inside the same transaction as the successful claim', async () => {
    const tenantId = `tenant_${randomUUID()}`;
    const communicationId = randomUUID();
    const deliveryId = randomUUID();
    const now = new Date();

    await prisma.communication.create({
      data: {
        id: communicationId,
        tenantId,
        sourceModuleId: 'integration-test',
        eventType: 'DeliveryAttemptTest',
        sourceEventId: randomUUID(),
        aggregateId: randomUUID(),
        aggregateVersion: 1,
        schemaVersion: '1.0',
        correlationId: `corr_${deliveryId}`,
        occurredAt: now,
        payload: {},
        status: 'QUEUED',
        version: 1,
      },
    });

    await prisma.delivery.create({
      data: {
        id: deliveryId,
        communicationId,
        tenantId,
        channel: 'EMAIL',
        recipient: 'integration@example.com',
        provider: 'test-provider',
        status: 'QUEUED',
        attemptCount: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
    });

    const transactionContext: TransactionContextPort = {
      run: async (work) => prisma.$transaction(async (client) => {
        const transactionClient = client as unknown as PrismaClient;
        return work({
          communications: new (require('../repositories/prisma-communication.repository').PrismaCommunicationRepository)(transactionClient),
          deliveries: new PrismaDeliveryRepository(transactionClient),
          attempts: new PrismaAttemptRepository(transactionClient),
          processedEvents: new (require('../repositories/prisma-transaction-processed-event.repository').PrismaTransactionProcessedEventRepository)(transactionClient),
          queuePublications: new (require('../repositories/prisma-queue-publication.repository').PrismaQueuePublicationRepository)(transactionClient),
          deadLetterRecords: new (require('../repositories/prisma-dead-letter.repository').PrismaDeadLetterRepository)(transactionClient),
        });
      }),
    };

    const useCase = new ClaimDeliveryExecutionUseCase(transactionContext);
    const result = await useCase.execute({
      tenantId,
      communicationId,
      deliveryId,
      channel: 'EMAIL',
      recipient: 'integration@example.com',
      provider: 'test-provider',
      attemptNumber: 1,
      correlationId: 'corr-1',
      payload: {},
      eventType: 'TestEvent',
      version: 1,
      executable: true,
    });

    expect(result?.attemptNumber).toBe(1);

    const attempts = await prisma.attempt.findMany({ where: { deliveryId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].attemptNumber).toBe(1);
    expect(attempts[0].status).toBe('PROCESSING');

    await prisma.attempt.delete({ where: { id: attempts[0].id } });
    await prisma.delivery.delete({ where: { id: deliveryId } });
    await prisma.communication.delete({ where: { id: communicationId } });
  });
});
