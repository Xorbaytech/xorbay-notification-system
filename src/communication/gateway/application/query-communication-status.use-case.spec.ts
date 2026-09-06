import { QueryCommunicationStatusUseCase } from './query-communication-status.use-case';
import { CommunicationRepositoryPort } from '../../persistence/ports/communication-repository.port';
import { DeliveryRepositoryPort } from '../../persistence/ports/delivery-repository.port';
import { AttemptRepositoryPort } from '../../persistence/ports/attempt-repository.port';

const buildCommunicationRepo = (): jest.Mocked<CommunicationRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn().mockResolvedValue({
    id: 'comm-1',
    tenantId: 'tenant-1',
    sourceModuleId: 'attendance',
    eventType: 'AttendanceMarked',
    sourceEventId: 'evt-1',
    aggregateId: 'student-1',
    aggregateVersion: 1,
    schemaVersion: '1.0',
    correlationId: 'corr-1',
    occurredAt: new Date(),
    payload: {},
    status: 'PROCESSING',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
});

const buildDeliveryRepo = (): jest.Mocked<DeliveryRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByCommunicationId: jest.fn().mockResolvedValue([
    {
      id: 'del-1',
      communicationId: 'comm-1',
      tenantId: 'tenant-1',
      channel: 'EMAIL',
      recipient: 'user@example.com',
      status: 'SENT',
      attemptCount: 1,
      version: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  findByTenantAndStatus: jest.fn(),
  update: jest.fn(),
  claimForExecution: jest.fn(),
});

const buildAttemptRepo = (): jest.Mocked<AttemptRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByDeliveryId: jest.fn().mockResolvedValue([
    {
      id: 'att-1',
      deliveryId: 'del-1',
      tenantId: 'tenant-1',
      attemptNumber: 1,
      provider: 'SMTP',
      status: 'SENT',
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  update: jest.fn(),
  getLatestByDeliveryId: jest.fn(),
});

describe('QueryCommunicationStatusUseCase', () => {
  it('returns communication status with deliveries and attempts', async () => {
    const useCase = new QueryCommunicationStatusUseCase(
      buildCommunicationRepo(),
      buildDeliveryRepo(),
      buildAttemptRepo(),
    );

    const result = await useCase.execute('comm-1', 'tenant-1');

    expect(result).not.toBeNull();
    expect(result!.communicationId).toBe('comm-1');
    expect(result!.status).toBe('SENT');
    expect(result!.deliveries).toHaveLength(1);
    expect(result!.deliveries[0].deliveryId).toBe('del-1');
    expect(result!.deliveries[0].attempts).toHaveLength(1);
    expect(result!.deliveries[0].attempts[0].provider).toBe('SMTP');
  });

  it('returns null when communication is not found (tenant isolation)', async () => {
    const commRepo = buildCommunicationRepo();
    commRepo.findById.mockResolvedValue(null);
    const useCase = new QueryCommunicationStatusUseCase(
      commRepo,
      buildDeliveryRepo(),
      buildAttemptRepo(),
    );

    const result = await useCase.execute('comm-missing', 'tenant-other');

    expect(result).toBeNull();
  });

  it('enforces tenant isolation via repository call', async () => {
    const commRepo = buildCommunicationRepo();
    const useCase = new QueryCommunicationStatusUseCase(
      commRepo,
      buildDeliveryRepo(),
      buildAttemptRepo(),
    );

    await useCase.execute('comm-1', 'tenant-1');

    expect(commRepo.findById).toHaveBeenCalledWith('comm-1', 'tenant-1');
  });
});
