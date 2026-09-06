import { RecordDeliveryExecutionOutcomeUseCase } from './record-delivery-execution-outcome.use-case';
import { TransactionContextPort } from '../../persistence/ports/transaction-context.port';

describe('RecordDeliveryExecutionOutcomeUseCase', () => {
  const metrics = { recordDeliveryOutcome: jest.fn() } as unknown as any;

  it('updates the Attempt and Delivery together for a successful outcome', async () => {
    const attempts = {
      findById: jest.fn().mockResolvedValue({
        id: 'att_123',
        deliveryId: 'del_123',
        tenantId: 'tenant_123',
        attemptNumber: 1,
        provider: 'SMTP',
        status: 'PROCESSING',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    const deliveries = {
      findById: jest.fn().mockResolvedValue({
        id: 'del_123',
        communicationId: 'comm_123',
        tenantId: 'tenant_123',
        channel: 'EMAIL',
        recipient: 'student@example.com',
        provider: 'SMTP',
        status: 'PROCESSING',
        attemptCount: 1,
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    const transaction: TransactionContextPort = {
      run: async (work) => work({
        attempts: attempts as never,
        deliveries: deliveries as never,
        communications: {} as never,
        processedEvents: {} as never,
        queuePublications: {} as never,
        deadLetterRecords: {} as never,
      }),
    };

    const useCase = new RecordDeliveryExecutionOutcomeUseCase(transaction, metrics);
    const sentAt = new Date();

    await useCase.record({
      deliveryId: 'del_123',
      attemptId: 'att_123',
      tenantId: 'tenant_123',
      status: 'SENT',
      providerRef: 'provider-ref-1',
      responseCode: '250',
      sentAt,
    });

    expect(attempts.update).toHaveBeenCalledWith('att_123', 'tenant_123', expect.objectContaining({
      status: 'SENT',
      providerRef: 'provider-ref-1',
      responseCode: '250',
      sentAt,
      version: 2,
    }));
    expect(deliveries.update).toHaveBeenCalledWith('del_123', 'tenant_123', expect.objectContaining({
      status: 'SENT',
      sentAt,
      version: 3,
    }));
  });

  it('rejects an attempt that does not belong to the requested delivery', async () => {
    const transaction: TransactionContextPort = {
      run: async (work) => work({
        attempts: {
          findById: jest.fn().mockResolvedValue({ id: 'att_123', deliveryId: 'other_delivery', tenantId: 'tenant_123' }),
        } as never,
        deliveries: {} as never,
        communications: {} as never,
        processedEvents: {} as never,
        queuePublications: {} as never,
        deadLetterRecords: {} as never,
      }),
    };

    const useCase = new RecordDeliveryExecutionOutcomeUseCase(transaction, metrics);

    await expect(useCase.record({
      deliveryId: 'del_123',
      attemptId: 'att_123',
      tenantId: 'tenant_123',
      status: 'FAILED',
    })).rejects.toThrow('Attempt not found');
  });

  it('uses the tenant boundary when loading both records', async () => {
    const attempts = { findById: jest.fn().mockResolvedValue(null) };
    const transaction: TransactionContextPort = {
      run: async (work) => work({
        attempts: attempts as never,
        deliveries: {} as never,
        communications: {} as never,
        processedEvents: {} as never,
        queuePublications: {} as never,
        deadLetterRecords: {} as never,
      }),
    };

    const useCase = new RecordDeliveryExecutionOutcomeUseCase(transaction, metrics);

    await expect(useCase.record({
      deliveryId: 'del_123',
      attemptId: 'att_123',
      tenantId: 'tenant_other',
      status: 'FAILED',
    })).rejects.toThrow('Attempt not found');

    expect(attempts.findById).toHaveBeenCalledWith('att_123', 'tenant_other');
  });
});
