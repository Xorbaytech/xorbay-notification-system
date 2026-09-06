import { ProcessProviderCallbackUseCase } from './process-provider-callback.use-case';
import { RecordDeliveryExecutionOutcomeUseCase } from './record-delivery-execution-outcome.use-case';
import { RecoverDeliveryUseCase } from './recover-delivery.use-case';
import { AttemptRepositoryPort } from '../../persistence/ports/attempt-repository.port';
import { DeliveryRepositoryPort } from '../../persistence/ports/delivery-repository.port';

const buildRecordOutcome = (): jest.Mocked<RecordDeliveryExecutionOutcomeUseCase> => ({
  record: jest.fn().mockResolvedValue(undefined),
} as any);

const buildRecoverDelivery = (): jest.Mocked<RecoverDeliveryUseCase> => ({
  execute: jest.fn().mockResolvedValue({ action: 'TERMINAL' }),
} as any);

const buildAttempts = (): jest.Mocked<AttemptRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn().mockResolvedValue({
    id: 'att-1',
    deliveryId: 'del-1',
    tenantId: 'tenant-1',
    attemptNumber: 1,
    status: 'PROCESSING',
    version: 1,
  }),
  findByDeliveryId: jest.fn(),
  update: jest.fn(),
  getLatestByDeliveryId: jest.fn(),
});

const buildDeliveries = (): jest.Mocked<DeliveryRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn().mockResolvedValue({
    id: 'del-1',
    communicationId: 'comm-1',
    tenantId: 'tenant-1',
    channel: 'EMAIL',
    status: 'PROCESSING',
    version: 1,
    createdAt: new Date(),
  }),
  findByCommunicationId: jest.fn(),
  findByTenantAndStatus: jest.fn(),
  update: jest.fn(),
  claimForExecution: jest.fn(),
});

describe('ProcessProviderCallbackUseCase', () => {
  it('records DELIVERED outcome without triggering recovery', async () => {
    const recordOutcome = buildRecordOutcome();
    const recoverDelivery = buildRecoverDelivery();
    const useCase = new ProcessProviderCallbackUseCase(
      recordOutcome,
      recoverDelivery,
      buildAttempts(),
      buildDeliveries(),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      deliveryId: 'del-1',
      attemptId: 'att-1',
      outcome: 'DELIVERED',
      correlationId: 'corr-1',
      occurredAt: new Date(),
    });

    expect(recordOutcome.record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DELIVERED' }),
    );
    expect(recoverDelivery.execute).not.toHaveBeenCalled();
  });

  it('records FAILED outcome and triggers recovery', async () => {
    const recordOutcome = buildRecordOutcome();
    const recoverDelivery = buildRecoverDelivery();
    const useCase = new ProcessProviderCallbackUseCase(
      recordOutcome,
      recoverDelivery,
      buildAttempts(),
      buildDeliveries(),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      deliveryId: 'del-1',
      attemptId: 'att-1',
      outcome: 'FAILED',
      failureCategory: 'TRANSIENT',
      correlationId: 'corr-1',
      occurredAt: new Date(),
    });

    expect(recordOutcome.record).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
    expect(recoverDelivery.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        communicationId: 'comm-1',
        deliveryId: 'del-1',
        providerResult: expect.objectContaining({ outcome: 'FAILED', failureCategory: 'TRANSIENT' }),
      }),
    );
  });
});
