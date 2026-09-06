import { BullmqDeliveryQueueAdapter } from './bullmq-delivery-queue.adapter';
import { QueueCommand } from '../../common/types/queue-command';

const command = (id: string, priority = 5): QueueCommand => ({
  stableJobKey: `tenant:DELIVERY_EXECUTION:${id}`,
  workType: 'DELIVERY_EXECUTION',
  logicalWorkId: id,
  tenantId: 'tenant',
  correlationId: `corr-${id}`,
  schemaVersion: '1.0',
  priority,
});

describe('BullmqDeliveryQueueAdapter bulk submission', () => {
  it('groups commands by priority queue and preserves stable job ids', async () => {
    const normal = { addBulk: jest.fn(async (jobs: any[]) => jobs.map((_, index) => ({ id: `normal-${index}` }))) };
    const critical = { addBulk: jest.fn(async (jobs: any[]) => jobs.map((_, index) => ({ id: `critical-${index}` }))) };
    const bulk = { addBulk: jest.fn(async (jobs: any[]) => jobs.map((_, index) => ({ id: `bulk-${index}` }))) };
    const adapter = new BullmqDeliveryQueueAdapter(normal as any, critical as any, bulk as any);

    await expect(adapter.submitMany!([command('normal'), command('critical', 1), command('bulk', 8)])).resolves.toEqual([
      { jobId: 'normal-0' },
      { jobId: 'critical-0' },
      { jobId: 'bulk-0' },
    ]);

    expect(normal.addBulk).toHaveBeenCalledWith([
      expect.objectContaining({ opts: expect.objectContaining({ jobId: 'tenant-DELIVERY_EXECUTION-normal' }) }),
    ]);
    expect(critical.addBulk).toHaveBeenCalledTimes(1);
    expect(bulk.addBulk).toHaveBeenCalledTimes(1);
  });

  it('reports successful lanes when another lane rejects', async () => {
    const normal = { addBulk: jest.fn(async (jobs: any[]) => jobs.map(() => ({ id: 'tenant-DELIVERY_EXECUTION-normal' }))) };
    const critical = { addBulk: jest.fn().mockRejectedValue(new Error('critical unavailable')) };
    const bulk = { addBulk: jest.fn() };
    const adapter = new BullmqDeliveryQueueAdapter(normal as any, critical as any, bulk as any);

    await expect(adapter.submitMany!([command('normal'), command('critical', 1)])).rejects.toMatchObject({
      name: 'QueueBatchSubmissionError',
      accepted: [{ jobId: 'tenant-DELIVERY_EXECUTION-normal' }],
    });
    expect(bulk.addBulk).not.toHaveBeenCalled();
  });
});
