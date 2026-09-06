import { PrismaClient } from '@prisma/client';
import { PrismaTransactionContext } from '../prisma-transaction-context';

const buildPrismaMock = () => {
  const transactionClient = {
    communication: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
    },
    delivery: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
    },
    attempt: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
    },
    processedEvent: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient)),
  } as unknown as PrismaClient;

  return { prisma, transactionClient };
};

describe('Prisma transaction context', () => {
  it('binds all persistence repositories to the same transaction client', async () => {
    const { prisma, transactionClient } = buildPrismaMock();
    const context = new PrismaTransactionContext(prisma);

    await context.run(async (tx) => {
      await tx.communications.create({
        id: 'comm_123',
        tenantId: 'tenant_123',
        sourceModuleId: 'attendance',
        eventType: 'AttendanceMarked',
        sourceEventId: 'evt_123',
        aggregateId: 'student_123',
        aggregateVersion: 1,
        schemaVersion: '1.0',
        correlationId: 'corr_123',
        occurredAt: new Date(),
        payload: {},
        status: 'QUEUED',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx.deliveries.create({
        id: 'del_123',
        communicationId: 'comm_123',
        tenantId: 'tenant_123',
        channel: 'EMAIL',
        recipient: 'recipient_123',
        status: 'PLANNED',
        attemptCount: 0,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx.attempts.create({
        id: 'attempt_123',
        deliveryId: 'del_123',
        tenantId: 'tenant_123',
        attemptNumber: 1,
        provider: 'TEST_PROVIDER',
        status: 'QUEUED',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.communication.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.delivery.create).toHaveBeenCalledTimes(1);
    expect(transactionClient.attempt.create).toHaveBeenCalledTimes(1);
  });

  it('propagates transaction work failure so the database transaction can roll back', async () => {
    const { prisma } = buildPrismaMock();
    const context = new PrismaTransactionContext(prisma);
    const failure = new Error('delivery persistence failed');

    await expect(
      context.run(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
});
