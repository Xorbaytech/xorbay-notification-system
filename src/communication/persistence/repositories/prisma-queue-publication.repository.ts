import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  QueuePublicationRecord,
  QueuePublicationRepositoryPort,
} from '../ports/queue-publication-repository.port';

@Injectable()
export class PrismaQueuePublicationRepository implements QueuePublicationRepositoryPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async create(data: QueuePublicationRecord): Promise<QueuePublicationRecord> {
    const record = await this.prisma.queuePublication.create({
      data: {
        id: data.id,
        tenantId: data.tenantId,
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        batchId: data.batchId ?? null,
        workType: data.workType,
        priority: data.priority ?? 5,
        stableJobKey: data.stableJobKey,
        payloadReference: data.payloadReference ?? null,
        status: data.status,
        attemptCount: data.attemptCount,
        availableAt: data.availableAt,
        lastAttemptAt: data.lastAttemptAt ?? null,
        acceptedAt: data.acceptedAt ?? null,
        failureCode: data.failureCode ?? null,
        failureReason: data.failureReason ?? null,
        correlationId: data.correlationId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    });

    return record as unknown as QueuePublicationRecord;
  }

  async findByStableJobKey(tenantId: string, stableJobKey: string): Promise<QueuePublicationRecord | null> {
    const record = await this.prisma.queuePublication.findFirst({
      where: { tenantId, stableJobKey },
    });

    return (record ?? null) as QueuePublicationRecord | null;
  }

  async findLatestByAggregateId(tenantId: string, aggregateId: string): Promise<QueuePublicationRecord | null> {
    const record = await this.prisma.queuePublication.findFirst({
      where: { tenantId, aggregateId },
      orderBy: { createdAt: 'desc' },
    });
    return (record ?? null) as QueuePublicationRecord | null;
  }

  async claimNext(now: Date): Promise<QueuePublicationRecord | null> {
    const rows = await this.claimRows(now, 1);
    return rows[0] ?? null;
  }

  async claimNextBatch(now: Date, limit: number): Promise<QueuePublicationRecord[]> {
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 1000));
    return this.claimRows(now, safeLimit);
  }

  async markAcceptedMany(ids: string[], acceptedAt: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.queuePublication.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'ACCEPTED',
        acceptedAt,
      },
    });
  }

  private async claimRows(now: Date, limit: number): Promise<QueuePublicationRecord[]> {
    // Atomic claim prevents duplicate relay work when multiple relay
    // instances run concurrently.
    const leaseTimeoutMs = this.readLeaseTimeoutMs();
    const staleSubmittingBefore = new Date(now.getTime() - leaseTimeoutMs);
    const rows = await this.prisma.$transaction(async (tx) => tx.$queryRaw<Array<Record<string, any>>>`
      WITH candidate AS (
        SELECT id
        FROM "queue_publications"
        WHERE (
          (status IN ('PENDING', 'RECOVERY_REQUIRED') AND "available_at" <= ${now})
          OR (status = 'SUBMITTING' AND "updated_at" <= ${staleSubmittingBefore})
        )
        -- Lower priority numbers are more urgent. created_at remains the
        -- deterministic tie-breaker so FIFO ordering is preserved within a lane.
        ORDER BY "priority" ASC, "created_at" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "queue_publications" AS publication
      SET status = 'SUBMITTING',
          "attempt_count" = "attempt_count" + 1,
          "last_attempt_at" = ${now},
          "updated_at" = NOW()
      FROM candidate
      WHERE publication.id = candidate.id
      RETURNING publication.*
    `, {
      maxWait: transactionSetting('PRISMA_TX_MAX_WAIT_MS', 10000, 1000, 60000),
      timeout: transactionSetting('PRISMA_TX_TIMEOUT_MS', 30000, 5000, 120000),
    });

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      batchId: row.batch_id,
      workType: row.work_type,
      priority: row.priority ?? 5,
      stableJobKey: row.stable_job_key,
      payloadReference: row.payload_reference,
      status: row.status,
      attemptCount: row.attempt_count,
      availableAt: row.available_at,
      lastAttemptAt: row.last_attempt_at,
      acceptedAt: row.accepted_at,
      failureCode: row.failure_code,
      failureReason: row.failure_reason,
      correlationId: row.correlation_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) as QueuePublicationRecord[];
  }

  async markAccepted(id: string, acceptedAt: Date): Promise<QueuePublicationRecord> {
    const record = await this.prisma.queuePublication.update({
      where: { id },
      data: {
        status: 'ACCEPTED',
        acceptedAt,
      },
    });

    return record as unknown as QueuePublicationRecord;
  }

  async markRecoveryRequired(
    id: string,
    failureCode: string,
    failureReason: string,
    availableAt: Date,
  ): Promise<QueuePublicationRecord> {
    const record = await this.prisma.queuePublication.update({
      where: { id },
      data: {
        status: 'RECOVERY_REQUIRED',
        failureCode,
        failureReason,
        availableAt,
      },
    });

    return record as unknown as QueuePublicationRecord;
  }

  async countPending(): Promise<number> {
    return this.prisma.queuePublication.count({
      where: {
        status: { in: ['PENDING', 'RECOVERY_REQUIRED', 'SUBMITTING'] },
      },
    });
  }

  private readLeaseTimeoutMs(): number {
    const configured = Number(process.env.QUEUE_PUBLICATION_LEASE_TIMEOUT_MS ?? 60_000);
    return Number.isFinite(configured)
      ? Math.max(5_000, Math.min(Math.floor(configured), 15 * 60_000))
      : 60_000;
  }
}

function transactionSetting(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(min, Math.min(Math.floor(value), max)) : fallback;
}
