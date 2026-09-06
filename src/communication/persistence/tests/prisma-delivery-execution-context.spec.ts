import { PrismaDeliveryExecutionContext } from '../prisma-delivery-execution-context';
import { DeliveryRepositoryPort } from '../ports/delivery-repository.port';
import { AttemptRepositoryPort } from '../ports/attempt-repository.port';
import { CommunicationRepositoryPort } from '../ports/communication-repository.port';

const deliveryRepository = (): jest.Mocked<DeliveryRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByCommunicationId: jest.fn(),
  findByTenantAndStatus: jest.fn(),
  update: jest.fn(),
  claimForExecution: jest.fn(),
});

const attemptRepository = (): jest.Mocked<AttemptRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByDeliveryId: jest.fn(),
  update: jest.fn(),
  getLatestByDeliveryId: jest.fn(),
});

const communicationRepository = (): jest.Mocked<CommunicationRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn(),
});

describe('PrismaDeliveryExecutionContext', () => {
  it('re-resolves an executable delivery from the authoritative repositories', async () => {
    const deliveries = deliveryRepository();
    const attempts = attemptRepository();
    const communications = communicationRepository();
    deliveries.findById.mockResolvedValue({
      id: 'del_123',
      communicationId: 'comm_123',
      tenantId: 'tenant_123',
      channel: 'EMAIL',
      recipient: 'student@example.com',
      provider: 'SMTP',
      status: 'QUEUED',
      attemptCount: 1,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    attempts.getLatestByDeliveryId.mockResolvedValue({
      id: 'att_001',
      deliveryId: 'del_123',
      tenantId: 'tenant_123',
      attemptNumber: 1,
      provider: 'SMTP',
      status: 'FAILED',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    communications.findById.mockResolvedValue({
      id: 'comm_123',
      tenantId: 'tenant_123',
      payload: { test: 123 },
      eventType: 'TestEvent',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const context = new PrismaDeliveryExecutionContext(deliveries, attempts, communications);

    await expect(
      context.resolve({
        stableJobKey: 'delivery:del_123',
        workType: 'DELIVERY_EXECUTION',
        logicalWorkId: 'del_123',
        tenantId: 'tenant_123',
        correlationId: 'corr_123',
        schemaVersion: '1.0',
      }),
    ).resolves.toEqual({
      tenantId: 'tenant_123',
      communicationId: 'comm_123',
      deliveryId: 'del_123',
      channel: 'EMAIL',
      recipient: 'student@example.com',
      provider: 'SMTP',
      attemptNumber: 2,
      correlationId: 'corr_123',
      payload: { test: 123 },
      eventType: 'TestEvent',
      executable: true,
      version: 2,
    });
  });

  it('does not expose a non-executable delivery to dispatch', async () => {
    const deliveries = deliveryRepository();
    const attempts = attemptRepository();
    deliveries.findById.mockResolvedValue({
      id: 'del_123',
      communicationId: 'comm_123',
      tenantId: 'tenant_123',
      channel: 'EMAIL',
      recipient: 'student@example.com',
      provider: 'SMTP',
      status: 'SENT',
      attemptCount: 1,
      version: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const communications = communicationRepository();

    const context = new PrismaDeliveryExecutionContext(deliveries, attempts, communications);

    await expect(
      context.resolve({
        stableJobKey: 'delivery:del_123',
        workType: 'DELIVERY_EXECUTION',
        logicalWorkId: 'del_123',
        tenantId: 'tenant_123',
        correlationId: 'corr_123',
        schemaVersion: '1.0',
      }),
    ).resolves.toBeNull();
    expect(attempts.getLatestByDeliveryId).not.toHaveBeenCalled();
  });

  it('enforces tenant isolation when resolving a delivery', async () => {
    const deliveries = deliveryRepository();
    const attempts = attemptRepository();
    const communications = communicationRepository();
    deliveries.findById.mockResolvedValue(null);

    const context = new PrismaDeliveryExecutionContext(deliveries, attempts, communications);

    await expect(
      context.resolve({
        stableJobKey: 'delivery:del_123',
        workType: 'DELIVERY_EXECUTION',
        logicalWorkId: 'del_123',
        tenantId: 'tenant_other',
        correlationId: 'corr_123',
        schemaVersion: '1.0',
      }),
    ).resolves.toBeNull();
    expect(deliveries.findById).toHaveBeenCalledWith('del_123', 'tenant_other');
  });
});
