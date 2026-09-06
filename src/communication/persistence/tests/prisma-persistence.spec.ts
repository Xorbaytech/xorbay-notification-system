import { PrismaClient } from '@prisma/client';
import { PrismaCommunicationRepository } from '../repositories/prisma-communication.repository';
import { PrismaDeliveryRepository } from '../repositories/prisma-delivery.repository';
import { PrismaAttemptRepository } from '../repositories/prisma-attempt.repository';
import { PrismaProcessedEventRepository } from '../repositories/prisma-processed-event.repository';

const buildPrismaMock = () => ({
  communication: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  delivery: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  attempt: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  processedEvent: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
}) as unknown as PrismaClient;

describe('Prisma persistence foundation', () => {
  it('creates a communication record with tenant scoped idempotency data', async () => {
    const prisma = buildPrismaMock();
    const repo = new PrismaCommunicationRepository(prisma);

    await repo.create({
      id: 'comm_123',
      tenantId: 'tenant_123',
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      schemaVersion: '1.0',
      sourceEventId: 'evt_123',
      correlationId: 'corr_123',
      aggregateId: 'student_456',
      aggregateVersion: 17,
      occurredAt: new Date('2026-08-10T05:30:00Z'),
      payload: { studentId: 'student_456', attendanceStatus: 'ABSENT' },
      status: 'QUEUED',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(prisma.communication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant_123',
          sourceEventId: 'evt_123',
          aggregateVersion: 17,
          status: 'QUEUED',
        }),
      }),
    );
  });

  it('creates a delivery tied to a communication and tenant', async () => {
    const prisma = buildPrismaMock();
    const repo = new PrismaDeliveryRepository(prisma);

    await repo.create({
      id: 'del_123',
      communicationId: 'comm_123',
      tenantId: 'tenant_123',
      channel: 'EMAIL',
      recipient: 'student@example.com',
      status: 'PLANNED',
      attemptCount: 0,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(prisma.delivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          communicationId: 'comm_123',
          tenantId: 'tenant_123',
          channel: 'EMAIL',
          status: 'PLANNED',
        }),
      }),
    );
  });

  it('finds deliveries by communication within the tenant', async () => {
    const prisma = buildPrismaMock();
    (prisma.delivery.findMany as jest.Mock).mockResolvedValue([{ id: 'del_123', tenantId: 'tenant_123' }]);
    const repo = new PrismaDeliveryRepository(prisma);

    const result = await repo.findByCommunicationId('comm_123', 'tenant_123');

    expect(result).toHaveLength(1);
    expect(prisma.delivery.findMany).toHaveBeenCalledWith({
      where: { communicationId: 'comm_123', tenantId: 'tenant_123' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('finds deliveries by tenant and status in creation order', async () => {
    const prisma = buildPrismaMock();
    (prisma.delivery.findMany as jest.Mock).mockResolvedValue([{ id: 'del_123' }, { id: 'del_456' }]);
    const repo = new PrismaDeliveryRepository(prisma);

    const result = await repo.findByTenantAndStatus('tenant_123', 'PROCESSING');

    expect(result).toHaveLength(2);
    expect(prisma.delivery.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant_123', status: 'PROCESSING' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('finds only bounded processing deliveries whose execution lease expired', async () => {
    const prisma = buildPrismaMock();
    (prisma.delivery.findMany as jest.Mock).mockResolvedValue([{ id: 'del_123', status: 'PROCESSING' }]);
    const repo = new PrismaDeliveryRepository(prisma);
    const olderThan = new Date('2026-09-01T06:00:00.000Z');

    const result = await repo.findStaleProcessing(olderThan, 100);

    expect(result).toHaveLength(1);
    expect(prisma.delivery.findMany).toHaveBeenCalledWith({
      where: { status: 'PROCESSING', updatedAt: { lt: olderThan } },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
  });

  it('updates a delivery only within its tenant boundary', async () => {
    const prisma = buildPrismaMock();
    (prisma.delivery.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.delivery.findFirst as jest.Mock).mockResolvedValue({ id: 'del_123', tenantId: 'tenant_123', status: 'PROCESSING' });
    const repo = new PrismaDeliveryRepository(prisma);

    await repo.update('del_123', 'tenant_123', { status: 'PROCESSING', version: 2 });

    expect(prisma.delivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'del_123', tenantId: 'tenant_123' },
      data: { status: 'PROCESSING', version: 2 },
    });
  });

  it('creates an attempt with delivery-scoped attempt number and version', async () => {
    const prisma = buildPrismaMock();
    const repo = new PrismaAttemptRepository(prisma);

    await repo.create({
      id: 'att_123',
      deliveryId: 'del_123',
      tenantId: 'tenant_123',
      attemptNumber: 1,
      provider: 'SMTP',
      status: 'QUEUED',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(prisma.attempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryId: 'del_123',
          tenantId: 'tenant_123',
          attemptNumber: 1,
          provider: 'SMTP',
        }),
      }),
    );
  });

  it('finds attempts for one delivery in attempt-number order', async () => {
    const prisma = buildPrismaMock();
    (prisma.attempt.findMany as jest.Mock).mockResolvedValue([{ attemptNumber: 1 }, { attemptNumber: 2 }]);
    const repo = new PrismaAttemptRepository(prisma);

    const result = await repo.findByDeliveryId('del_123', 'tenant_123');

    expect(result).toHaveLength(2);
    expect(prisma.attempt.findMany).toHaveBeenCalledWith({
      where: { deliveryId: 'del_123', tenantId: 'tenant_123' },
      orderBy: { attemptNumber: 'asc' },
    });
  });

  it('gets the latest attempt without overwriting attempt history', async () => {
    const prisma = buildPrismaMock();
    (prisma.attempt.findFirst as jest.Mock).mockResolvedValue({ id: 'att_002', attemptNumber: 2 });
    const repo = new PrismaAttemptRepository(prisma);

    const result = await repo.getLatestByDeliveryId('del_123', 'tenant_123');

    expect(result?.id).toBe('att_002');
    expect(prisma.attempt.findFirst).toHaveBeenCalledWith({
      where: { deliveryId: 'del_123', tenantId: 'tenant_123' },
      orderBy: { attemptNumber: 'desc' },
    });
  });

  it('updates an attempt only within its tenant boundary', async () => {
    const prisma = buildPrismaMock();
    (prisma.attempt.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.attempt.findFirst as jest.Mock).mockResolvedValue({ id: 'att_123', tenantId: 'tenant_123', status: 'SENT' });
    const repo = new PrismaAttemptRepository(prisma);

    await repo.update('att_123', 'tenant_123', { status: 'SENT', version: 2 });

    expect(prisma.attempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'att_123', tenantId: 'tenant_123' },
      data: { status: 'SENT', version: 2 },
    });
  });

  it('updates an attempt only while its processing version is still current', async () => {
    const prisma = buildPrismaMock();
    (prisma.attempt.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.attempt.findFirst as jest.Mock).mockResolvedValue({ id: 'att_123', tenantId: 'tenant_123', status: 'FAILED' });
    const repo = new PrismaAttemptRepository(prisma);

    await repo.updateIfProcessingVersion('att_123', 'tenant_123', 1, { status: 'FAILED', version: 2 });

    expect(prisma.attempt.updateMany).toHaveBeenCalledWith({
      where: { id: 'att_123', tenantId: 'tenant_123', version: 1, status: 'PROCESSING' },
      data: { status: 'FAILED', version: 2 },
    });
  });

  it('records a processed event for idempotency and duplicate prevention', async () => {
    const prisma = buildPrismaMock();
    const repo = new PrismaProcessedEventRepository(prisma);

    await repo.create({
      id: 'proc_123',
      tenantId: 'tenant_123',
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      sourceEventId: 'evt_123',
      aggregateId: 'student_456',
      aggregateVersion: 17,
      schemaVersion: '1.0',
      correlationId: 'corr_123',
      payload: { studentId: 'student_456', attendanceStatus: 'ABSENT' },
      status: 'ACCEPTED',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(prisma.processedEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant_123',
          sourceEventId: 'evt_123',
          aggregateVersion: 17,
          status: 'ACCEPTED',
        }),
      }),
    );
  });
});
