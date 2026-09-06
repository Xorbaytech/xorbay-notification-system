import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ProcessedEventRecord, ProcessedEventRepositoryPort } from '../ports/processed-event-repository.port';

@Injectable()
export class PrismaProcessedEventRepository implements ProcessedEventRepositoryPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async create(data: ProcessedEventRecord): Promise<ProcessedEventRecord> {
    return this.prisma.processedEvent.create({
      data: {
        id: data.id,
        tenantId: data.tenantId,
        sourceModuleId: data.sourceModuleId,
        eventType: data.eventType,
        sourceEventId: data.sourceEventId,
        aggregateId: data.aggregateId,
        aggregateVersion: data.aggregateVersion,
        schemaVersion: data.schemaVersion,
        correlationId: data.correlationId,
        priorityHint: data.priorityHint,
        payload: data.payload as Prisma.InputJsonValue,
        status: data.status,
        attemptCount: data.attemptCount ?? 0,
        nextAttemptAt: data.nextAttemptAt ?? null,
        lastErrorCode: data.lastErrorCode ?? null,
        lastErrorMessage: data.lastErrorMessage ?? null,
        version: data.version,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    }) as unknown as ProcessedEventRecord;
  }

  async findBySourceEventId(
    tenantId: string,
    sourceModuleId: string,
    eventType: string,
    aggregateId: string,
    aggregateVersion: number,
    sourceEventId: string,
  ): Promise<ProcessedEventRecord | null> {
    const record = await this.prisma.processedEvent.findFirst({
      where: {
        tenantId,
        sourceModuleId,
        eventType,
        aggregateId,
        aggregateVersion,
        sourceEventId,
      },
    });

    return (record ?? null) as ProcessedEventRecord | null;
  }

  async claimNext(limit: number): Promise<ProcessedEventRecord[]> {
    // Claim and transition in one PostgreSQL transaction. A separate
    // findMany + updateMany allows two instances to select the same rows
    // before either instance changes their status.
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 500));
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<Record<string, any>>>`
        WITH candidates AS (
          SELECT id
          FROM "processed_events"
          WHERE status = 'ACCEPTED'
            AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= NOW())
          ORDER BY COALESCE("next_attempt_at", "created_at") ASC, "created_at" ASC
          LIMIT ${safeLimit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "processed_events" AS event
        SET status = 'PROCESSING', "updated_at" = NOW()
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.*
      `;

      return rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        sourceModuleId: row.source_module_id,
        eventType: row.event_type,
        sourceEventId: row.source_event_id,
        aggregateId: row.aggregate_id,
        aggregateVersion: row.aggregate_version,
        schemaVersion: row.schema_version,
        correlationId: row.correlation_id,
        priorityHint: row.priority_hint,
        payload: row.payload as Record<string, unknown>,
        status: 'PROCESSING',
        attemptCount: row.attempt_count ?? 0,
        nextAttemptAt: row.next_attempt_at,
        lastErrorCode: row.last_error_code,
        lastErrorMessage: row.last_error_message,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })) as ProcessedEventRecord[];
    });
  }

  async markProcessed(id: string): Promise<void> {
    await this.prisma.processedEvent.update({
      where: { id },
      data: { status: 'PROCESSED' },
    });
  }

  async recoverStaleProcessing(olderThan: Date): Promise<number> {
    const result = await this.prisma.processedEvent.updateMany({
      where: { status: 'PROCESSING', updatedAt: { lt: olderThan } },
      data: { status: 'ACCEPTED', nextAttemptAt: new Date(), updatedAt: new Date() },
    });
    return result.count;
  }

  async recoverProcessing(
    id: string,
    failure: { code?: string | null; message?: string | null; retryAfterMs?: number } = {},
  ): Promise<void> {
    const retryAfterMs = Math.max(
      1_000,
      Math.min(Math.floor(failure.retryAfterMs ?? 5_000), 24 * 60 * 60 * 1_000),
    );
    await this.prisma.$executeRaw`
      UPDATE "processed_events"
      SET status = 'ACCEPTED',
          attempt_count = attempt_count + 1,
          next_attempt_at = NOW() + (${retryAfterMs} * INTERVAL '1 millisecond'),
          last_error_code = ${failure.code ?? null},
          last_error_message = ${failure.message ?? null},
          updated_at = NOW()
      WHERE id = ${id}::uuid AND status = 'PROCESSING'
    `;
  }
}
