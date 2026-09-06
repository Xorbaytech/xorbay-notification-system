import { AttemptRecord } from '../../persistence/ports/attempt-repository.port';
import { DeliveryRecord } from '../../persistence/ports/delivery-repository.port';
import { TransactionContextPort, TransactionScope } from '../../persistence/ports/transaction-context.port';
import { EvaluateRetryUseCase } from './evaluate-retry.use-case';
import { RecoverStaleDeliveryUseCase } from './recover-stale-delivery.use-case';

const now = new Date('2026-09-01T07:00:00.000Z');

const delivery: DeliveryRecord = {
  id: 'delivery-1',
  communicationId: 'communication-1',
  batchId: 'batch-1',
  tenantId: 'tenant-1',
  channel: 'IN_APP',
  recipient: 'user-1',
  provider: 'ERP_IN_APP',
  status: 'PROCESSING',
  attemptCount: 1,
  version: 2,
  createdAt: new Date('2026-09-01T06:59:00.000Z'),
  updatedAt: new Date('2026-09-01T06:59:00.000Z'),
};

const attempt: AttemptRecord = {
  id: 'attempt-1',
  deliveryId: delivery.id,
  tenantId: delivery.tenantId,
  attemptNumber: 1,
  provider: 'ERP_IN_APP',
  status: 'PROCESSING',
  version: 1,
  createdAt: delivery.createdAt,
  updatedAt: delivery.updatedAt,
};

function buildScope(overrides: Partial<TransactionScope> = {}): TransactionScope {
  return {
    communications: {
      findById: jest.fn().mockResolvedValue({
        id: delivery.communicationId,
        tenantId: delivery.tenantId,
        correlationId: 'corr-1',
      }),
    } as never,
    deliveries: {
      findById: jest.fn().mockResolvedValue(delivery),
      updateIfProcessingVersion: jest.fn().mockResolvedValue({ ...delivery, status: 'RETRYING', version: 3 }),
    } as never,
    attempts: {
      getLatestByDeliveryId: jest.fn().mockResolvedValue(attempt),
      updateIfProcessingVersion: jest.fn().mockResolvedValue({ ...attempt, status: 'FAILED', version: 2 }),
    } as never,
    queuePublications: {
      findByStableJobKey: jest.fn().mockResolvedValue(null),
      findLatestByAggregateId: jest.fn().mockResolvedValue({ priority: 1 }),
      create: jest.fn().mockResolvedValue({}),
    } as never,
    deadLetterRecords: { create: jest.fn().mockResolvedValue({}) } as never,
    processedEvents: {} as never,
    ...overrides,
  };
}

function buildContext(scope: TransactionScope): TransactionContextPort {
  return { run: jest.fn(async (work) => work(scope)) };
}

describe('RecoverStaleDeliveryUseCase', () => {
  it('closes the abandoned attempt and creates one durable retry publication', async () => {
    const scope = buildScope();
    const useCase = new RecoverStaleDeliveryUseCase(
      buildContext(scope),
      new EvaluateRetryUseCase({ maxRetries: 3, baseBackoffMs: 5_000, maxBackoffMs: 300_000, retryDeadlineMs: 1_800_000 }),
    );

    const result = await useCase.execute({ delivery, now, timeoutMs: 120_000 });

    expect(result.action).toBe('RETRY');
    expect(scope.deliveries.updateIfProcessingVersion).toHaveBeenCalledWith(
      delivery.id,
      delivery.tenantId,
      delivery.version,
      expect.objectContaining({ status: 'RETRYING', version: 3, updatedAt: now }),
    );
    expect(scope.attempts.updateIfProcessingVersion).toHaveBeenCalledWith(
      attempt.id,
      attempt.tenantId,
      attempt.version,
      expect.objectContaining({ status: 'FAILED', responseCode: 'WORKER_TIMEOUT', version: 2 }),
    );
    expect(scope.queuePublications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: delivery.id,
        batchId: delivery.batchId,
        priority: 1,
        stableJobKey: 'tenant-1:stale-recovery:delivery-1:2',
        correlationId: 'corr-1',
        status: 'PENDING',
      }),
    );
  });

  it('does not duplicate a recovery publication when the stable key already exists', async () => {
    const scope = buildScope();
    (scope.queuePublications.findByStableJobKey as jest.Mock).mockResolvedValue({ id: 'existing-publication' });
    const useCase = new RecoverStaleDeliveryUseCase(buildContext(scope), new EvaluateRetryUseCase());

    const result = await useCase.execute({ delivery, now, timeoutMs: 120_000 });

    expect(result.action).toBe('RETRY');
    expect(scope.queuePublications.create).not.toHaveBeenCalled();
  });

  it('skips when another worker or callback wins the delivery CAS race', async () => {
    const scope = buildScope();
    (scope.deliveries.updateIfProcessingVersion as jest.Mock).mockResolvedValue(null);
    const useCase = new RecoverStaleDeliveryUseCase(buildContext(scope), new EvaluateRetryUseCase());

    const result = await useCase.execute({ delivery, now, timeoutMs: 120_000 });

    expect(result.action).toBe('SKIPPED');
    expect(scope.attempts.updateIfProcessingVersion).not.toHaveBeenCalled();
    expect(scope.queuePublications.create).not.toHaveBeenCalled();
  });

  it('moves an exhausted stale attempt to the existing DLQ path', async () => {
    const scope = buildScope();
    const exhaustedDelivery = { ...delivery, createdAt: new Date('2026-08-31T23:00:00.000Z') };
    (scope.deliveries.findById as jest.Mock).mockResolvedValue(exhaustedDelivery);
    (scope.attempts.getLatestByDeliveryId as jest.Mock).mockResolvedValue({ ...attempt, attemptNumber: 4 });
    const useCase = new RecoverStaleDeliveryUseCase(
      buildContext(scope),
      new EvaluateRetryUseCase({ maxRetries: 3, baseBackoffMs: 5_000, maxBackoffMs: 300_000, retryDeadlineMs: 1_800_000 }),
    );

    const result = await useCase.execute({ delivery: exhaustedDelivery, now, timeoutMs: 120_000 });

    expect(result.action).toBe('TERMINAL');
    expect(scope.deliveries.updateIfProcessingVersion).toHaveBeenCalledWith(
      exhaustedDelivery.id,
      exhaustedDelivery.tenantId,
      exhaustedDelivery.version,
      expect.objectContaining({ status: 'FAILED' }),
    );
    expect(scope.deadLetterRecords.create).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'WORKER_TIMEOUT', deliveryId: exhaustedDelivery.id }),
    );
    expect(scope.queuePublications.create).not.toHaveBeenCalled();
  });
});
