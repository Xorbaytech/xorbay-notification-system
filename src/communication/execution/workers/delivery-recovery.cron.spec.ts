import { DeliveryRecord } from '../../persistence/ports/delivery-repository.port';
import { DeliveryRecoveryCron } from './delivery-recovery.cron';

const delivery = {
  id: 'delivery-1',
  tenantId: 'tenant-1',
  status: 'PROCESSING',
  version: 2,
} as DeliveryRecord;

describe('DeliveryRecoveryCron', () => {
  const originalTimeout = process.env.DELIVERY_PROCESSING_TIMEOUT_MS;
  const originalBatchSize = process.env.DELIVERY_RECOVERY_BATCH_SIZE;

  afterEach(() => {
    if (originalTimeout === undefined) delete process.env.DELIVERY_PROCESSING_TIMEOUT_MS;
    else process.env.DELIVERY_PROCESSING_TIMEOUT_MS = originalTimeout;
    if (originalBatchSize === undefined) delete process.env.DELIVERY_RECOVERY_BATCH_SIZE;
    else process.env.DELIVERY_RECOVERY_BATCH_SIZE = originalBatchSize;
  });

  it('reconciles a bounded batch and continues after one candidate fails', async () => {
    process.env.DELIVERY_PROCESSING_TIMEOUT_MS = '10000';
    process.env.DELIVERY_RECOVERY_BATCH_SIZE = '2';
    const deliveries = {
      findStaleProcessing: jest.fn().mockResolvedValue([delivery, { ...delivery, id: 'delivery-2' }]),
    };
    const recover = {
      execute: jest.fn()
        .mockRejectedValueOnce(new Error('temporary test error'))
        .mockResolvedValueOnce({ action: 'RETRY', deliveryId: 'delivery-2', reason: 'recovered' }),
    };
    const cron = new DeliveryRecoveryCron(deliveries as never, recover as never);

    await cron.handleCron();

    expect(deliveries.findStaleProcessing).toHaveBeenCalledWith(expect.any(Date), 2);
    expect(recover.execute).toHaveBeenCalledTimes(2);
  });

  it('prevents overlapping local reconciliation ticks', async () => {
    let release: () => void = () => undefined;
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    const deliveries = {
      findStaleProcessing: jest.fn().mockResolvedValue([delivery]),
    };
    const recover = { execute: jest.fn().mockReturnValue(blocker.then(() => ({ action: 'SKIPPED', deliveryId: delivery.id, reason: 'race' }))) };
    const cron = new DeliveryRecoveryCron(deliveries as never, recover as never);

    const first = cron.handleCron();
    const second = cron.handleCron();
    release();
    await Promise.all([first, second]);

    expect(deliveries.findStaleProcessing).toHaveBeenCalledTimes(1);
  });
});
