import { PrismaClient } from '@prisma/client';
import { PrismaBroadcastBatchRepository } from './prisma-broadcast-batch.repository';

describe('PrismaBroadcastBatchRepository', () => {
  it('reconciles partial delivery failure and rolls progress up to the campaign', async () => {
    const now = new Date('2026-08-30T00:00:00.000Z');
    const batch = {
      id: 'batch-1',
      campaignId: 'campaign-1',
      tenantId: 'tenant-1',
      status: 'PROCESSING',
      queueAcceptedAt: null,
    };
    const tx = {
      broadcastBatch: {
        findFirst: jest.fn().mockResolvedValue(batch),
        update: jest.fn().mockResolvedValue({
          ...batch,
          status: 'PARTIALLY_COMPLETED',
          failedCount: 1,
          deliveredCount: 2,
        }),
        findMany: jest.fn().mockResolvedValue([
          { status: 'COMPLETED' },
          { status: 'PARTIALLY_COMPLETED' },
        ]),
      },
      delivery: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'DELIVERED', _count: { _all: 2 } },
          { status: 'FAILED', _count: { _all: 1 } },
        ]),
      },
      queuePublication: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'ACCEPTED', _count: { _all: 3 } },
        ]),
      },
      campaign: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    } as unknown as PrismaClient;
    const repository = new PrismaBroadcastBatchRepository(prisma);

    const result = await repository.refreshProgress('batch-1', 'tenant-1', now);

    expect(result?.status).toBe('PARTIALLY_COMPLETED');
    expect(tx.broadcastBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'batch-1' },
        data: expect.objectContaining({
          status: 'PARTIALLY_COMPLETED',
          deliveredCount: 2,
          failedCount: 1,
          completedAt: now,
        }),
      }),
    );
    expect(tx.campaign.update).toHaveBeenCalledWith({
      where: { id: 'campaign-1' },
      data: expect.objectContaining({
        status: 'PARTIALLY_COMPLETED',
        completedBatches: 1,
        failedBatches: 1,
        completedAt: now,
      }),
    });
  });

  it('does not mutate state when the batch belongs to another tenant or is missing', async () => {
    const tx = {
      broadcastBatch: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = {
      $transaction: jest.fn(async (work: (client: typeof tx) => unknown) => work(tx)),
    } as unknown as PrismaClient;
    const repository = new PrismaBroadcastBatchRepository(prisma);

    await expect(repository.refreshProgress('missing', 'tenant-1')).resolves.toBeNull();
    expect(tx.broadcastBatch.findFirst).toHaveBeenCalledWith({
      where: { id: 'missing', tenantId: 'tenant-1' },
    });
  });
});
