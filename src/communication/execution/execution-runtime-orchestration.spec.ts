import { ExecuteDeliveryJobUseCase } from './workers/execute-delivery-job.use-case';
import { DispatchDeliveryUseCase } from './dispatcher/dispatch-delivery.use-case';
import { RecordDeliveryExecutionOutcomeUseCase } from './dispatcher/record-delivery-execution-outcome.use-case';
import { DeliveryExecutionContextPort } from '../common/interfaces/delivery-execution-context.port';
import { ProviderRegistryPort } from '../providers/ports/provider-registry.port';
import { DispatchDeliveryPort } from '../common/interfaces/dispatch-delivery.port';
import { QueueCommand } from '../common/types/queue-command';
import { TransactionContextPort } from '../persistence/ports/transaction-context.port';
import { ClaimDeliveryExecutionUseCase } from './dispatcher/claim-delivery-execution.use-case';
import { TemplateEnginePort } from '../providers/template/template-engine.port';

const command: QueueCommand = {
  stableJobKey: 'tenant-1:delivery-1:1',
  workType: 'DELIVERY_EXECUTION',
  logicalWorkId: 'delivery-1',
  tenantId: 'tenant-1',
  correlationId: 'corr-1',
  schemaVersion: '1.0',
};

describe('execution runtime orchestration', () => {
  it('runs queue job through authoritative claim, provider registry and outcome persistence', async () => {
    const context = {
      tenantId: 'tenant-1',
      communicationId: 'comm-1',
      deliveryId: 'delivery-1',
      channel: 'EMAIL',
      recipient: 'user@example.com',
      provider: 'SMTP',
      attemptNumber: 1,
      correlationId: 'corr-1',
      payload: {},
      eventType: 'TestEvent',
      version: 3,
      executable: true,
    };
    const claimed = { ...context, attemptId: 'attempt-1', version: 4 };

    const templateEngine = { render: jest.fn().mockResolvedValue('rendered') } as unknown as TemplateEnginePort;

    const outcomeRecord = jest.fn();
    const metrics = { recordDeliveryOutcome: jest.fn() } as unknown as any;
    const recordOutcome = { record: jest.fn() } as unknown as any;
    const recoverDelivery = { execute: jest.fn() } as unknown as any;

    const outcome = new RecordDeliveryExecutionOutcomeUseCase({
      run: async (work) => work({
        attempts: {
          findById: jest.fn().mockResolvedValue({
            id: 'attempt-1',
            deliveryId: 'delivery-1',
            tenantId: 'tenant-1',
            version: 1,
            provider: 'SMTP',
          }),
          update: jest.fn().mockResolvedValue({}),
        } as never,
        deliveries: {
          findById: jest.fn().mockResolvedValue({
            id: 'delivery-1',
            tenantId: 'tenant-1',
            channel: 'EMAIL',
            version: 1,
          }),
          update: jest.fn().mockResolvedValue({}),
        } as never,
        communications: {} as never,
        processedEvents: {} as never,
        queuePublications: {} as never,
        deadLetterRecords: {} as never,
      }),
    } as TransactionContextPort, metrics);
    const originalRecord = outcome.record.bind(outcome);
    jest.spyOn(outcome, 'record').mockImplementation(async (value) => {
      outcomeRecord(value);
      await originalRecord(value);
    });

    const provider = {
      dispatch: async (executionContext: typeof claimed) => {
        return {
          outcome: 'ACCEPTED',
          providerMessageId: 'provider-ref-1',
          providerStatusReference: '250',
          failureCategory: null,
          occurredAt: new Date(),
        };
      },
    };
    const providerRegistry: ProviderRegistryPort = {
      resolve: jest.fn().mockReturnValue(provider),
    };

    const resolve = jest.fn().mockResolvedValue(context);
    const claim = jest.fn().mockResolvedValue(claimed);
    const dispatchUseCase = new DispatchDeliveryUseCase(
      { resolve } as DeliveryExecutionContextPort,
      { execute: claim } as unknown as ClaimDeliveryExecutionUseCase,
      providerRegistry,
      outcome, // passing the real mocked outcome to simulate what it does
      recoverDelivery,
      templateEngine
    );
    const dispatch: DispatchDeliveryPort = {
      dispatch: async (value) => dispatchUseCase.execute(value),
    };
    const worker = new ExecuteDeliveryJobUseCase(dispatch);

    const result = await worker.execute(command);

    expect(result).toEqual({
      status: 'DISPATCHED',
      stableJobKey: command.stableJobKey,
      logicalWorkId: command.logicalWorkId,
    });
    expect(resolve).toHaveBeenCalledWith(command);
    expect(claim).toHaveBeenCalledWith(context);
    expect(providerRegistry.resolve).toHaveBeenCalledWith({ channel: 'EMAIL', provider: 'SMTP' });
    expect(outcomeRecord).toHaveBeenCalledWith(expect.objectContaining({
      deliveryId: 'delivery-1',
      attemptId: 'attempt-1',
      tenantId: 'tenant-1',
      status: 'SENT',
    }));
  });

  it('does not reach the provider or outcome boundary when the authoritative delivery is not executable', async () => {
    const resolve = jest.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      communicationId: 'comm-1',
      deliveryId: 'delivery-1',
      channel: 'EMAIL',
      recipient: 'user@example.com',
      provider: 'SMTP',
      attemptNumber: 1,
      correlationId: 'corr-1',
      payload: {},
      eventType: 'TestEvent',
      version: 3,
      executable: false,
    });
    const claim = jest.fn();
    const providerRegistry: ProviderRegistryPort = { resolve: jest.fn() };
    const recordOutcome = { record: jest.fn() } as unknown as any;
    const recoverDelivery = { execute: jest.fn() } as unknown as any;
    const templateEngine = { render: jest.fn() } as unknown as any;

    const dispatchUseCase = new DispatchDeliveryUseCase(
      { resolve } as DeliveryExecutionContextPort,
      { execute: claim } as unknown as ClaimDeliveryExecutionUseCase,
      providerRegistry,
      recordOutcome,
      recoverDelivery,
      templateEngine
    );
    const dispatch: DispatchDeliveryPort = {
      dispatch: async (value) => dispatchUseCase.execute(value),
    };
    const useCase = new ExecuteDeliveryJobUseCase(dispatch);

    await useCase.execute(command);

    expect(claim).not.toHaveBeenCalled();
    expect(providerRegistry.resolve).not.toHaveBeenCalled();
  });
});
