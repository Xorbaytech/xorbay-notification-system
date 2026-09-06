import { ClaimDeliveryExecutionUseCase } from './claim-delivery-execution.use-case';
import { DeliveryExecutionContext } from '../../common/interfaces/delivery-execution-context.port';
import { TransactionContextPort } from '../../persistence/ports/transaction-context.port';

const executionContext: DeliveryExecutionContext = {
  tenantId: 'tenant-1',
  communicationId: 'comm-1',
  deliveryId: 'delivery-1',
  channel: 'EMAIL',
  recipient: 'user@example.com',
  provider: 'SMTP',
  attemptNumber: 1,
  correlationId: 'corr-1',
  payload: { test: 123 },
  eventType: 'TestEvent',
  version: 3,
  executable: true,
};

describe('ClaimDeliveryExecutionUseCase', () => {
  it('claims the delivery and creates the first processing attempt atomically', async () => {
    const claimForExecution = jest.fn().mockResolvedValue({
      id: 'delivery-1',
      communicationId: 'comm-1',
      tenantId: 'tenant-1',
      channel: 'EMAIL',
      recipient: 'user@example.com',
      provider: 'provider-1',
      status: 'PROCESSING',
      attemptCount: 1,
      version: 8,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const create = jest.fn().mockResolvedValue(undefined);
    const run = jest.fn(async (work: any) => work({ deliveries: { claimForExecution }, attempts: { create } }));

    const useCase = new ClaimDeliveryExecutionUseCase({ run } as TransactionContextPort);
    const result = await useCase.execute(executionContext);

    expect(claimForExecution).toHaveBeenCalledWith('delivery-1', 'tenant-1', 3, expect.any(Date));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: 'delivery-1',
      tenantId: 'tenant-1',
      attemptNumber: 1,
      provider: 'SMTP',
      status: 'PROCESSING',
      version: 1,
    }));
    expect(result).toEqual(expect.objectContaining({ attemptNumber: 1, attemptId: expect.any(String), version: 8 }));
  });

  it('does not create an attempt when the optimistic claim loses the race', async () => {
    const claimForExecution = jest.fn().mockResolvedValue(null);
    const create = jest.fn();
    const run = jest.fn(async (work: any) => work({ deliveries: { claimForExecution }, attempts: { create } }));

    const useCase = new ClaimDeliveryExecutionUseCase({ run } as TransactionContextPort);
    const result = await useCase.execute(executionContext);

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not start a transaction for a non-executable context', async () => {
    const run = jest.fn();
    const useCase = new ClaimDeliveryExecutionUseCase({ run } as TransactionContextPort);

    const result = await useCase.execute({ ...executionContext, executable: false });

    expect(result).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });
});
