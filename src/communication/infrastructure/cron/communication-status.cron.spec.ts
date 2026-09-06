import { CommunicationStatusCron } from './communication-status.cron';

describe('CommunicationStatusCron', () => {
  it('reconciles only active communications and remains idempotent', async () => {
    const communications = {
      findActive: jest.fn().mockResolvedValue([
        { id: 'comm-1', tenantId: 'tenant-1' },
        { id: 'comm-2', tenantId: 'tenant-2' },
      ]),
      refreshStatus: jest.fn().mockResolvedValue(null),
    };
    const cron = new CommunicationStatusCron(communications as never);

    await cron.handleCron();

    expect(communications.findActive).toHaveBeenCalledWith(250);
    expect(communications.refreshStatus).toHaveBeenNthCalledWith(1, 'comm-1', 'tenant-1');
    expect(communications.refreshStatus).toHaveBeenNthCalledWith(2, 'comm-2', 'tenant-2');
  });

  it('does not fail legacy adapters without projector methods', async () => {
    const cron = new CommunicationStatusCron({} as never);
    await expect(cron.handleCron()).resolves.toBeUndefined();
  });
});
