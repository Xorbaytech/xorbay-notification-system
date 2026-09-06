import { OutboxRelayCron } from './outbox-relay.cron';

describe('OutboxRelayCron', () => {
  const originalMax = process.env.OUTBOX_RELAY_MAX_PER_TICK;
  const originalBatch = process.env.OUTBOX_RELAY_BATCH_SIZE;

  afterEach(() => {
    if (originalMax === undefined) delete process.env.OUTBOX_RELAY_MAX_PER_TICK;
    else process.env.OUTBOX_RELAY_MAX_PER_TICK = originalMax;
    if (originalBatch === undefined) delete process.env.OUTBOX_RELAY_BATCH_SIZE;
    else process.env.OUTBOX_RELAY_BATCH_SIZE = originalBatch;
  });

  it('uses bounded batches and counts accepted publications', async () => {
    process.env.OUTBOX_RELAY_MAX_PER_TICK = '3';
    process.env.OUTBOX_RELAY_BATCH_SIZE = '2';
    const relay = {
      runBatch: jest
        .fn()
        .mockResolvedValueOnce({ status: 'ACCEPTED', publicationId: 'p1', acceptedCount: 2, claimedCount: 2 })
        .mockResolvedValueOnce({ status: 'ACCEPTED', publicationId: 'p3', acceptedCount: 1, claimedCount: 1 }),
    };
    const cron = new OutboxRelayCron(relay as any);

    await cron.handleCron();

    expect(relay.runBatch).toHaveBeenNthCalledWith(1, 2);
    expect(relay.runBatch).toHaveBeenNthCalledWith(2, 1);
  });

  it('stops after a partial batch and leaves recovery rows for the next tick', async () => {
    process.env.OUTBOX_RELAY_MAX_PER_TICK = '500';
    process.env.OUTBOX_RELAY_BATCH_SIZE = '500';
    const relay = {
      runBatch: jest.fn().mockResolvedValue({
        status: 'RECOVERY_REQUIRED',
        publicationId: 'p2',
        acceptedCount: 1,
        recoveryCount: 1,
        claimedCount: 2,
      }),
    };
    const cron = new OutboxRelayCron(relay as any);

    await cron.handleCron();

    expect(relay.runBatch).toHaveBeenCalledTimes(1);
    expect(relay.runBatch).toHaveBeenCalledWith(500);
  });
});
