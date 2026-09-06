import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { BroadcastBatchRecord, BroadcastBatchRepositoryPort } from '../ports/broadcast-batch-repository.port';

@Injectable()
export class PrismaBroadcastBatchRepository implements BroadcastBatchRepositoryPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async create(data: BroadcastBatchRecord): Promise<BroadcastBatchRecord> {
    const record = await this.prisma.broadcastBatch.create({
      data: {
        id: data.id,
        campaignId: data.campaignId,
        tenantId: data.tenantId,
        batchNumber: data.batchNumber,
        status: data.status,
        recipientCount: data.recipientCount,
        queuedCount: data.queuedCount,
        acceptedCount: data.acceptedCount,
        deliveredCount: data.deliveredCount,
        failedCount: data.failedCount,
        idempotencyKey: data.idempotencyKey,
        queueAcceptedAt: data.queueAcceptedAt ?? null,
        startedAt: data.startedAt ?? null,
        completedAt: data.completedAt ?? null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    });
    return record as unknown as BroadcastBatchRecord;
  }

  async findActive(limit: number): Promise<BroadcastBatchRecord[]> {
    const records = await this.prisma.broadcastBatch.findMany({
      where: { status: { in: ['QUEUED', 'PROCESSING', 'PARTIALLY_COMPLETED'] } },
      orderBy: { createdAt: 'asc' },
      take: Math.max(1, Math.min(Math.floor(limit), 1000)),
    });
    return records as unknown as BroadcastBatchRecord[];
  }

  async refreshProgress(id: string, tenantId: string, now = new Date()): Promise<BroadcastBatchRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.broadcastBatch.findFirst({ where: { id, tenantId } });
      if (!batch) return null;

      const deliveryGroups = await tx.delivery.groupBy({
        by: ['status'],
        where: { batchId: id, tenantId },
        _count: { _all: true },
      });
      const publicationGroups = await tx.queuePublication.groupBy({
        by: ['status'],
        where: { batchId: id, tenantId },
        _count: { _all: true },
      });
      const count = (groups: Array<{ status: string; _count: { _all: number } }>, ...statuses: string[]) =>
        groups.filter((group) => statuses.includes(group.status)).reduce((sum, group) => sum + group._count._all, 0);
      const total = deliveryGroups.reduce((sum, group) => sum + group._count._all, 0);
      const acceptedCount = count(publicationGroups, 'ACCEPTED');
      const deliveredCount = count(deliveryGroups, 'DELIVERED');
      const failedCount = count(deliveryGroups, 'FAILED');
      const inFlightCount = count(deliveryGroups, 'PLANNED', 'QUEUED', 'PROCESSING', 'RETRYING');
      const cancelledCount = count(deliveryGroups, 'CANCELLED');
      const successfulCount = count(deliveryGroups, 'SENT', 'DELIVERED');
      const status = resolveBatchStatus({ total, inFlightCount, successfulCount, failedCount, cancelledCount });
      const updated = await tx.broadcastBatch.update({
        where: { id },
        data: {
          status,
          queuedCount: inFlightCount,
          acceptedCount,
          deliveredCount,
          failedCount,
          queueAcceptedAt: acceptedCount >= total && total > 0 ? (batch.queueAcceptedAt ?? now) : batch.queueAcceptedAt,
          startedAt: inFlightCount < total && total > 0 ? (batch.startedAt ?? now) : batch.startedAt,
          completedAt: ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED'].includes(status)
            ? (batch.completedAt ?? now)
            : null,
        },
      });

      const allBatches = await tx.broadcastBatch.findMany({
        where: { campaignId: batch.campaignId, tenantId },
        select: { status: true },
      });
      const completedBatches = allBatches.filter((item) => item.status === 'COMPLETED').length;
      const failedBatches = allBatches.filter((item) => ['PARTIALLY_COMPLETED', 'FAILED'].includes(item.status)).length;
      const allTerminal = allBatches.length > 0 && allBatches.every((item) =>
        ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED'].includes(item.status));
      const campaignStatus = allTerminal
        ? failedBatches > 0 ? (completedBatches > 0 ? 'PARTIALLY_COMPLETED' : 'FAILED') : 'COMPLETED'
        : allBatches.some((item) => item.status === 'PROCESSING') ? 'PROCESSING' : 'QUEUED';
      await tx.campaign.update({
        where: { id: batch.campaignId },
        data: {
          status: campaignStatus,
          completedBatches,
          failedBatches,
          completedAt: allTerminal ? now : null,
        },
      });

      return updated as unknown as BroadcastBatchRecord;
    }, {
      maxWait: transactionSetting('PRISMA_TX_MAX_WAIT_MS', 10000, 1000, 60000),
      timeout: transactionSetting('PRISMA_TX_TIMEOUT_MS', 30000, 5000, 120000),
    });
  }
}

function resolveBatchStatus(input: {
  total: number;
  inFlightCount: number;
  successfulCount: number;
  failedCount: number;
  cancelledCount: number;
}): BroadcastBatchRecord['status'] {
  if (input.total === 0) return 'FAILED';
  if (input.inFlightCount > 0) return input.successfulCount > 0 || input.failedCount > 0 ? 'PROCESSING' : 'QUEUED';
  if (input.cancelledCount === input.total) return 'CANCELLED';
  if (input.failedCount > 0) return input.successfulCount > 0 ? 'PARTIALLY_COMPLETED' : 'FAILED';
  return 'COMPLETED';
}

function transactionSetting(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(min, Math.min(Math.floor(value), max)) : fallback;
}
