export type BroadcastBatchStatus = 'PENDING' | 'QUEUED' | 'PROCESSING' | 'PARTIALLY_COMPLETED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface BroadcastBatchRecord {
  readonly id: string;
  readonly campaignId: string;
  readonly tenantId: string;
  readonly batchNumber: number;
  readonly status: BroadcastBatchStatus;
  readonly recipientCount: number;
  readonly queuedCount: number;
  readonly acceptedCount: number;
  readonly deliveredCount: number;
  readonly failedCount: number;
  readonly idempotencyKey: string;
  readonly queueAcceptedAt?: Date | null;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BroadcastBatchRepositoryPort {
  create(data: BroadcastBatchRecord): Promise<BroadcastBatchRecord>;
  findActive(limit: number): Promise<BroadcastBatchRecord[]>;
  refreshProgress(id: string, tenantId: string, now?: Date): Promise<BroadcastBatchRecord | null>;
}

export const BROADCAST_BATCH_REPOSITORY = Symbol('BROADCAST_BATCH_REPOSITORY');
