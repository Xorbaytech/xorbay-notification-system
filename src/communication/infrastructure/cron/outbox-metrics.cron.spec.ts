import { OutboxMetricsCron } from './outbox-metrics.cron';

describe('OutboxMetricsCron', () => {
  it('publishes the durable outbox depth to metrics', async () => {
    const metrics = { setOutboxQueueDepth: jest.fn() } as any;
    const publications = { countPending: jest.fn().mockResolvedValue(7) } as any;
    const cron = new OutboxMetricsCron(metrics, publications);

    await cron.handleCron();

    expect(publications.countPending).toHaveBeenCalledTimes(1);
    expect(metrics.setOutboxQueueDepth).toHaveBeenCalledWith(7);
  });

  it('remains compatible with adapters that do not expose depth yet', async () => {
    const metrics = { setOutboxQueueDepth: jest.fn() } as any;
    const cron = new OutboxMetricsCron(metrics, {} as any);

    await expect(cron.handleCron()).resolves.toBeUndefined();
    expect(metrics.setOutboxQueueDepth).not.toHaveBeenCalled();
  });
});
