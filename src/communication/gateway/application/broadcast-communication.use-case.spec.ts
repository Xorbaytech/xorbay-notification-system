import { BroadcastCommunicationUseCase } from './broadcast-communication.use-case';
import { TransactionContextPort, TransactionScope } from '../../persistence/ports/transaction-context.port';

describe('BroadcastCommunicationUseCase campaign grouping', () => {
  const makeRepositories = () => ({
    communications: { create: jest.fn() },
    deliveries: { create: jest.fn() },
    queuePublications: { create: jest.fn() },
    campaigns: { create: jest.fn(), findByIdempotencyKey: jest.fn().mockResolvedValue(null) },
    broadcastBatches: { create: jest.fn() },
  });

  const command = {
    tenantId: 'tenant-a',
    sourceModuleId: 'erp-core',
    templateIdentity: 'broadcast.default',
    correlationId: 'corr-1',
    recipients: [
      { recipientId: 'user-1', profile: { email: 'one@example.test' } },
      { recipientId: 'user-2', profile: { email: 'two@example.test' } },
      { recipientId: 'user-3', profile: { email: 'three@example.test' } },
    ],
    channel: 'EMAIL',
    payload: { message: 'hello' },
    idempotencyKey: 'campaign-key-1',
  };

  let previousBatchSize: string | undefined;

  beforeEach(() => {
    previousBatchSize = process.env.BROADCAST_BATCH_SIZE;
    process.env.BROADCAST_BATCH_SIZE = '2';
  });

  afterEach(() => {
    if (previousBatchSize === undefined) delete process.env.BROADCAST_BATCH_SIZE;
    else process.env.BROADCAST_BATCH_SIZE = previousBatchSize;
  });

  it('persists one campaign and bounded batches inside the transaction scope', async () => {
    const repositories = makeRepositories();
    const transactionContext: TransactionContextPort = {
      run: jest.fn(async (work) => work(repositories as unknown as TransactionScope)),
    };
    const useCase = new BroadcastCommunicationUseCase(
      repositories.communications as never,
      repositories.deliveries as never,
      repositories.queuePublications as never,
      transactionContext,
    );

    const result = await useCase.execute(command);

    expect(result.deliveryCount).toBe(3);
    expect(result.batchCount).toBe(2);
    expect(repositories.campaigns.create).toHaveBeenCalledTimes(1);
    expect(repositories.broadcastBatches.create).toHaveBeenCalledTimes(2);
    expect(repositories.deliveries.create).toHaveBeenCalledTimes(3);
    expect(repositories.queuePublications.create).toHaveBeenCalledTimes(3);

    const batchIds = repositories.broadcastBatches.create.mock.calls.map(([batch]) => batch.id);
    const deliveryBatchIds = repositories.deliveries.create.mock.calls.map(([delivery]) => delivery.batchId);
    const publicationBatchIds = repositories.queuePublications.create.mock.calls.map(([publication]) => publication.batchId);
    expect(new Set(deliveryBatchIds)).toEqual(new Set(batchIds));
    expect(new Set(publicationBatchIds)).toEqual(new Set(batchIds));
  });

  it('deduplicates recipients by channel address before fan-out', async () => {
    const repositories = makeRepositories();
    const transactionContext: TransactionContextPort = {
      run: jest.fn(async (work) => work(repositories as unknown as TransactionScope)),
    };
    const useCase = new BroadcastCommunicationUseCase(
      repositories.communications as never,
      repositories.deliveries as never,
      repositories.queuePublications as never,
      transactionContext,
    );

    const result = await useCase.execute({
      ...command,
      recipients: [
        { recipientId: 'user-1', profile: { email: 'same@example.test' } },
        { recipientId: 'different-id', profile: { email: 'SAME@example.test' } },
        { recipientId: 'user-2', profile: { email: 'other@example.test' } },
      ],
    });

    expect(result.deliveryCount).toBe(2);
    expect(repositories.deliveries.create).toHaveBeenCalledTimes(2);
    expect(repositories.queuePublications.create).toHaveBeenCalledTimes(2);
    expect(repositories.campaigns.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalRecipients: 2, totalBatches: 1 }),
    );
  });

  it('keeps the legacy path intact when a transaction double has no campaign ports', async () => {
    const repositories = makeRepositories();
    const transactionContext: TransactionContextPort = {
      run: jest.fn(async (work) => work({
        communications: repositories.communications,
        deliveries: repositories.deliveries,
        queuePublications: repositories.queuePublications,
      } as unknown as TransactionScope)),
    };
    const useCase = new BroadcastCommunicationUseCase(
      repositories.communications as never,
      repositories.deliveries as never,
      repositories.queuePublications as never,
      transactionContext,
    );

    const result = await useCase.execute(command);

    expect(result.batchCount).toBeUndefined();
    expect(repositories.campaigns.create).not.toHaveBeenCalled();
    expect(repositories.broadcastBatches.create).not.toHaveBeenCalled();
    expect(repositories.deliveries.create.mock.calls.every(([delivery]) => delivery.batchId === null)).toBe(true);
  });

  it('returns the existing campaign for a repeated idempotency key', async () => {
    const repositories = makeRepositories();
    repositories.campaigns.findByIdempotencyKey.mockResolvedValue({
      id: 'campaign-existing',
      communicationId: 'communication-existing',
      totalRecipients: 3,
      totalBatches: 2,
    });
    const transactionContext: TransactionContextPort = {
      run: jest.fn(async (work) => work(repositories as unknown as TransactionScope)),
    };
    const useCase = new BroadcastCommunicationUseCase(
      repositories.communications as never,
      repositories.deliveries as never,
      repositories.queuePublications as never,
      transactionContext,
      repositories.campaigns as never,
      repositories.broadcastBatches as never,
    );

    const result = await useCase.execute(command);

    expect(result.communicationId).toBe('communication-existing');
    expect(result.campaignId).toBe('campaign-existing');
    expect(repositories.campaigns.create).not.toHaveBeenCalled();
    expect(transactionContext.run).not.toHaveBeenCalled();
  });
});
