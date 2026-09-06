import { PrismaAuditRepository } from './prisma-audit.repository';

const prisma = {
  auditRecord: {
    create: jest.fn(),
  },
};

describe('PrismaAuditRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists business significance as a durable audit record', async () => {
    prisma.auditRecord.create.mockResolvedValue({});
    const repository = new PrismaAuditRepository(prisma as never);

    await repository.recordBusinessSignificance({
      tenantId: 'tenant-1',
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      sourceEventId: 'evt-1',
      correlationId: 'corr-1',
      decision: 'NOTIFY',
      reason: 'Attendance requires notification',
    });

    expect(prisma.auditRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        correlationId: 'corr-1',
        eventType: 'BUSINESS_SIGNIFICANCE',
        actorType: 'SYSTEM',
        decision: 'NOTIFY',
        reasonCode: 'Attendance requires notification',
        metadata: {
          sourceModuleId: 'attendance',
          sourceEventType: 'AttendanceMarked',
          sourceEventId: 'evt-1',
        },
      }),
    });
  });
});
