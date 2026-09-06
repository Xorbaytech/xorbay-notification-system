import { RecoverDeliveryUseCase, RecoverDeliveryCommand } from './recover-delivery.use-case';
import { ClassifyFailureUseCase } from './classify-failure.use-case';
import { EvaluateRetryUseCase } from './evaluate-retry.use-case';
import { EvaluateFallbackUseCase } from './evaluate-fallback.use-case';
import { TransactionContextPort, TransactionScope } from '../../persistence/ports/transaction-context.port';

const buildTxContext = (overrides: Partial<TransactionScope> = {}): TransactionContextPort => ({
  run: async (work) =>
    work({
      communications: {} as never,
      processedEvents: {} as never,
      queuePublications: {
        create: jest.fn().mockResolvedValue({}),
        findByStableJobKey: jest.fn().mockResolvedValue(null),
        claimNext: jest.fn(),
        markAccepted: jest.fn(),
        markRecoveryRequired: jest.fn(),
      },
      deliveries: {
        create: jest.fn().mockResolvedValue({}),
        findById: jest.fn().mockResolvedValue({
          id: 'del-1',
          communicationId: 'comm-1',
          tenantId: 'tenant-1',
          channel: 'EMAIL',
          recipient: 'user@example.com',
          status: 'PROCESSING',
          attemptCount: 1,
          version: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findByCommunicationId: jest.fn().mockResolvedValue([
          { id: 'del-1', communicationId: 'comm-1', status: 'PROCESSING' },
        ]),
        update: jest.fn().mockResolvedValue({}),
        findByTenantAndStatus: jest.fn().mockResolvedValue([]),
        claimForExecution: jest.fn().mockResolvedValue(null),
      },
      attempts: {} as never,
      deadLetterRecords: { create: jest.fn() } as any,
      ...overrides,
    }),
});

const baseCommand: RecoverDeliveryCommand = {
  tenantId: 'tenant-1',
  communicationId: 'comm-1',
  deliveryId: 'del-1',
  attemptId: 'att-1',
  attemptNumber: 1,
  firstAttemptAt: new Date(Date.now() - 60_000), // 1 min ago (within deadline)
  channel: 'EMAIL',
  correlationId: 'corr-1',
  deliveryVersion: 2,
  providerResult: { outcome: 'FAILED', failureCategory: 'TRANSIENT', occurredAt: new Date() },
};

describe('RecoverDeliveryUseCase', () => {
  it('schedules retry for TRANSIENT failure within attempt limit', async () => {
    const tx = buildTxContext();
    const useCase = new RecoverDeliveryUseCase(
      tx,
      new ClassifyFailureUseCase(),
      new EvaluateRetryUseCase(),
      new EvaluateFallbackUseCase(),
    );

    const result = await useCase.execute(baseCommand);

    expect(result.action).toBe('RETRY');
    expect(result.classification).toBe('TRANSIENT');
  });

  it('creates fallback delivery for PERMANENT failure', async () => {
    const tx = buildTxContext();
    const useCase = new RecoverDeliveryUseCase(
      tx,
      new ClassifyFailureUseCase(),
      new EvaluateRetryUseCase(),
      new EvaluateFallbackUseCase(),
    );

    const result = await useCase.execute({
      ...baseCommand,
      providerResult: { outcome: 'FAILED', failureCategory: 'PERMANENT', occurredAt: new Date() },
    });

    expect(result.action).toBe('FALLBACK');
    expect(result.newDeliveryId).toBeDefined();
  });

  it('goes TERMINAL for SYSTEMIC failure (operator review required)', async () => {
    const tx = buildTxContext();
    const useCase = new RecoverDeliveryUseCase(
      tx,
      new ClassifyFailureUseCase(),
      new EvaluateRetryUseCase(),
      new EvaluateFallbackUseCase(),
    );

    const result = await useCase.execute({
      ...baseCommand,
      providerResult: { outcome: 'FAILED', failureCategory: 'SYSTEMIC', occurredAt: new Date() },
    });

    expect(result.action).toBe('TERMINAL');
    expect(result.classification).toBe('SYSTEMIC');
  });

  it('goes TERMINAL for AMBIGUOUS failure (TIMEOUT_UNKNOWN)', async () => {
    const tx = buildTxContext();
    const useCase = new RecoverDeliveryUseCase(
      tx,
      new ClassifyFailureUseCase(),
      new EvaluateRetryUseCase(),
      new EvaluateFallbackUseCase(),
    );

    const result = await useCase.execute({
      ...baseCommand,
      providerResult: { outcome: 'UNKNOWN', failureCategory: 'TIMEOUT_UNKNOWN', occurredAt: new Date() },
    });

    expect(result.action).toBe('TERMINAL');
    expect(result.classification).toBe('AMBIGUOUS');
  });

  it('goes TERMINAL for TRANSIENT when retry exhausted and no fallback available (PUSH channel)', async () => {
    // PUSH is last in cascade, existingFallbackCount >= 1 already means no fallback
    const tx = buildTxContext();
    const useCase = new RecoverDeliveryUseCase(
      tx,
      new ClassifyFailureUseCase(),
      // Override policy to have 0 retries allowed
      new EvaluateRetryUseCase({ maxRetries: 0, baseBackoffMs: 5000, maxBackoffMs: 300000, retryDeadlineMs: 1800000 }),
      new EvaluateFallbackUseCase(),
    );

    const result = await useCase.execute({
      ...baseCommand,
      channel: 'PUSH',
      providerResult: { outcome: 'FAILED', failureCategory: 'TRANSIENT', occurredAt: new Date() },
    });

    expect(result.action).toBe('TERMINAL');
  });

  it('does not create second fallback (SPEC-009 max 1)', async () => {
    // Simulate 2 existing deliveries (original + 1 fallback already created)
    const tx = buildTxContext({
      deliveries: {
        create: jest.fn().mockResolvedValue({}),
        findById: jest.fn().mockResolvedValue({
          id: 'del-2',
          communicationId: 'comm-1',
          tenantId: 'tenant-1',
          channel: 'SMS',
          recipient: 'user@example.com',
          status: 'PROCESSING',
          attemptCount: 1,
          version: 2,
          fallbackOfDeliveryId: 'del-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findByCommunicationId: jest.fn().mockResolvedValue([
          { id: 'del-1' }, // original
          { id: 'del-2', fallbackOfDeliveryId: 'del-1' }, // existing fallback
        ]),
        update: jest.fn().mockResolvedValue({}),
        findByTenantAndStatus: jest.fn().mockResolvedValue([]),
        claimForExecution: jest.fn().mockResolvedValue(null),
      } as never,
    });

    const useCase = new RecoverDeliveryUseCase(
      tx,
      new ClassifyFailureUseCase(),
      new EvaluateRetryUseCase({ maxRetries: 0, baseBackoffMs: 5000, maxBackoffMs: 300000, retryDeadlineMs: 1800000 }),
      new EvaluateFallbackUseCase(),
    );

    const result = await useCase.execute({
      ...baseCommand,
      deliveryId: 'del-2',
      channel: 'SMS',
      providerResult: { outcome: 'FAILED', failureCategory: 'PERMANENT', occurredAt: new Date() },
    });

    expect(result.action).toBe('TERMINAL');
  });

  it('does not consume fallback budget from unrelated broadcast recipients', async () => {
    const unrelatedDeliveries = Array.from({ length: 177 }, (_, index) => ({
      id: `recipient-${index}`,
      communicationId: 'comm-1',
      tenantId: 'tenant-1',
      channel: 'IN_APP',
      recipient: `user-${index}`,
      status: 'SENT' as const,
      attemptCount: 1,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const tx = buildTxContext({
      deliveries: {
        create: jest.fn().mockResolvedValue({}),
        findById: jest.fn().mockResolvedValue({
          id: 'del-1',
          communicationId: 'comm-1',
          tenantId: 'tenant-1',
          channel: 'EMAIL',
          recipient: 'user@example.com',
          status: 'PROCESSING',
          attemptCount: 1,
          version: 2,
          fallbackOfDeliveryId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findByCommunicationId: jest.fn().mockResolvedValue([
          { id: 'del-1', fallbackOfDeliveryId: null },
          ...unrelatedDeliveries,
        ]),
        update: jest.fn().mockResolvedValue({}),
        findByTenantAndStatus: jest.fn().mockResolvedValue([]),
        claimForExecution: jest.fn().mockResolvedValue(null),
      } as never,
    });

    const useCase = new RecoverDeliveryUseCase(
      tx,
      new ClassifyFailureUseCase(),
      new EvaluateRetryUseCase({ maxRetries: 0, baseBackoffMs: 5000, maxBackoffMs: 300000, retryDeadlineMs: 1800000 }),
      new EvaluateFallbackUseCase(),
    );

    const result = await useCase.execute({
      ...baseCommand,
      providerResult: { outcome: 'FAILED', failureCategory: 'PERMANENT', occurredAt: new Date() },
    });

    expect(result.action).toBe('FALLBACK');
  });
});
