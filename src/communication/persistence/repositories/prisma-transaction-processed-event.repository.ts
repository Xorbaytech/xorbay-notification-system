import { Prisma } from '@prisma/client';
import { ProcessedEventRecord } from '../ports/processed-event-repository.port';

export interface ProcessedEventIdentity {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  aggregateId: string;
  aggregateVersion: number;
  sourceEventId: string;
}

export interface ProcessingRecordResult {
  record: ProcessedEventRecord;
  created: boolean;
}

type TransactionClient = Prisma.TransactionClient;

export class PrismaTransactionProcessedEventRepository {
  constructor(private readonly prisma: TransactionClient) {}

  async findByBusinessIdentity(identity: ProcessedEventIdentity): Promise<ProcessedEventRecord | null> {
    const record = await this.prisma.processedEvent.findFirst({
      where: identity,
    });

    return (record ?? null) as ProcessedEventRecord | null;
  }

  async createProcessingRecord(data: ProcessedEventRecord): Promise<ProcessingRecordResult> {
    const inserted = await this.prisma.$queryRaw<ProcessedEventRecord[]>(Prisma.sql`
      INSERT INTO "processed_events" (
        "id",
        "tenant_id",
        "source_module_id",
        "event_type",
        "source_event_id",
        "aggregate_id",
        "aggregate_version",
        "schema_version",
        "correlation_id",
        "priority_hint",
        "payload",
        "status",
        "version",
        "created_at",
        "updated_at"
      )
      VALUES (
        ${data.id}::uuid,
        ${data.tenantId},
        ${data.sourceModuleId},
        ${data.eventType},
        ${data.sourceEventId},
        ${data.aggregateId},
        ${data.aggregateVersion},
        ${data.schemaVersion},
        ${data.correlationId},
        ${data.priorityHint ?? null},
        ${data.payload as Prisma.InputJsonValue},
        ${data.status},
        ${data.version},
        ${data.createdAt},
        ${data.updatedAt}
      )
      ON CONFLICT (
        "tenant_id",
        "source_module_id",
        "event_type",
        "aggregate_id",
        "aggregate_version",
        "source_event_id"
      ) DO NOTHING
      RETURNING
        "id",
        "tenant_id" AS "tenantId",
        "source_module_id" AS "sourceModuleId",
        "event_type" AS "eventType",
        "source_event_id" AS "sourceEventId",
        "aggregate_id" AS "aggregateId",
        "aggregate_version" AS "aggregateVersion",
        "schema_version" AS "schemaVersion",
        "correlation_id" AS "correlationId",
        "priority_hint" AS "priorityHint",
        "payload",
        "status",
        "version",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt"
    `);

    if (inserted.length > 0) {
      return { record: inserted[0], created: true };
    }

    const existing = await this.findByBusinessIdentity({
      tenantId: data.tenantId,
      sourceModuleId: data.sourceModuleId,
      eventType: data.eventType,
      aggregateId: data.aggregateId,
      aggregateVersion: data.aggregateVersion,
      sourceEventId: data.sourceEventId,
    });

    if (!existing) {
      throw new Error('Processed event conflict could not be reconciled.');
    }

    return { record: existing, created: false };
  }
}
