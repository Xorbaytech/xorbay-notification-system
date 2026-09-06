import { DispatchDeliveryUseCase } from './dispatch-delivery.use-case';
import { DeliveryExecutionContextPort } from '../../common/interfaces/delivery-execution-context.port';
import { ProviderRegistryPort } from '../../providers/ports/provider-registry.port';
import { QueueCommand } from '../../common/types/queue-command';
import { ClaimDeliveryExecutionUseCase } from './claim-delivery-execution.use-case';
import { RecordDeliveryExecutionOutcomeUseCase } from './record-delivery-execution-outcome.use-case';
import { RecoverDeliveryUseCase } from './recover-delivery.use-case';
import { TemplateEnginePort } from '../../providers/template/template-engine.port';

function context(overrides: Partial<Awaited<ReturnType<DeliveryExecutionContextPort['resolve']>>> = {}) {
  return {
    tenantId: 'tenant-1',
    communicationId: 'comm-1',
    deliveryId: 'delivery-1',
    channel: 'EMAIL',
    recipient: 'user@example.com',
    provider: 'provider-1',
    attemptNumber: 1,
    correlationId: 'corr-1',
    version: 3,
    executable: true,
    ...overrides,
  };
}

describe('DispatchDeliveryUseCase', () => {
  const command: QueueCommand = {
    stableJobKey: 'tenant-1:delivery-1:1',
    workType: 'DELIVERY_EXECUTION',
    logicalWorkId: 'delivery-1',
    tenantId: 'tenant-1',
    correlationId: 'corr-1',
    schemaVersion: '1.0',
  };

  let recordOutcome: jest.Mocked<RecordDeliveryExecutionOutcomeUseCase>;
  let recoverDelivery: jest.Mocked<RecoverDeliveryUseCase>;
  let templateEngine: jest.Mocked<TemplateEnginePort>;

  beforeEach(() => {
    recordOutcome = { record: jest.fn() } as unknown as any;
    recoverDelivery = { execute: jest.fn() } as unknown as any;
    templateEngine = { render: jest.fn().mockResolvedValue('rendered') } as unknown as any;
  });

  it('claims the authoritative delivery before provider dispatch', async () => {
    const resolve = jest.fn().mockResolvedValue(context());
    const claim = jest.fn().mockResolvedValue({ ...context(), attemptId: 'attempt-1', attemptNumber: 1, version: 4 });
    const dispatch = jest.fn().mockResolvedValue({ outcome: 'ACCEPTED' });
    const providerRegistry: ProviderRegistryPort = {
      resolve: jest.fn().mockReturnValue({ dispatch }),
    };

    const useCase = new DispatchDeliveryUseCase(
      { resolve } as DeliveryExecutionContextPort,
      { execute: claim } as unknown as ClaimDeliveryExecutionUseCase,
      providerRegistry,
      recordOutcome,
      recoverDelivery,
      templateEngine
    );

    await useCase.execute(command);

    expect(resolve).toHaveBeenCalledWith(command);
  });

  it('claims delivery and dispatches to the resolved provider', async () => {
    const provider = { dispatch: jest.fn().mockResolvedValue({ outcome: 'ACCEPTED' }) };
    const providerRegistry = { resolve: jest.fn().mockReturnValue(provider) } as unknown as ProviderRegistryPort;

    const useCase = new DispatchDeliveryUseCase(
      { resolve: jest.fn().mockResolvedValue({ executable: true, channel: 'EMAIL', provider: 'SMTP' }) } as unknown as DeliveryExecutionContextPort,
      { execute: jest.fn().mockResolvedValue({ channel: 'EMAIL', provider: 'SMTP' }) } as unknown as ClaimDeliveryExecutionUseCase,
      providerRegistry,
      recordOutcome,
      recoverDelivery,
      templateEngine
    );

    await useCase.execute({ workType: 'DELIVERY_EXECUTION' } as any);
    expect(provider.dispatch).toHaveBeenCalled();
  });

  it('skips dispatch if context is not executable', async () => {
    const providerRegistry = { resolve: jest.fn() } as unknown as ProviderRegistryPort;
    const useCase = new DispatchDeliveryUseCase(
      { resolve: jest.fn().mockResolvedValue({ executable: false }) } as unknown as DeliveryExecutionContextPort,
      { execute: jest.fn() } as unknown as ClaimDeliveryExecutionUseCase,
      providerRegistry,
      recordOutcome,
      recoverDelivery,
      templateEngine
    );

    await useCase.execute({ workType: 'DELIVERY_EXECUTION' } as any);
    expect(providerRegistry.resolve).not.toHaveBeenCalled();
  });

  it('skips dispatch if claim fails', async () => {
    const providerRegistry = { resolve: jest.fn() } as unknown as ProviderRegistryPort;
    const useCase = new DispatchDeliveryUseCase(
      { resolve: jest.fn().mockResolvedValue({ executable: true }) } as unknown as DeliveryExecutionContextPort,
      { execute: jest.fn().mockResolvedValue(null) } as unknown as ClaimDeliveryExecutionUseCase,
      providerRegistry,
      recordOutcome,
      recoverDelivery,
      templateEngine
    );

    await useCase.execute({ workType: 'DELIVERY_EXECUTION' } as any);
    expect(providerRegistry.resolve).not.toHaveBeenCalled();
  });

  it('throws for unsupported queue work type', async () => {
    const useCase = new DispatchDeliveryUseCase(
      { resolve: jest.fn() } as unknown as DeliveryExecutionContextPort,
      { execute: jest.fn() } as unknown as ClaimDeliveryExecutionUseCase,
      { resolve: jest.fn() } as unknown as ProviderRegistryPort,
      recordOutcome,
      recoverDelivery,
      templateEngine
    );
    await expect(
      useCase.execute({ ...command, workType: 'UNKNOWN' }),
    ).rejects.toThrow('Unsupported queue work type: UNKNOWN');
  });
});
