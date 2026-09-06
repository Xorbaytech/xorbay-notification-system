import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditPort, BusinessSignificanceAuditRecord } from './ports/audit.port';

@Injectable()
export class PrismaAuditRepository implements AuditPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async recordBusinessSignificance(record: BusinessSignificanceAuditRecord): Promise<void> {
    await this.prisma.auditRecord.create({
      data: {
        id: randomUUID(),
        tenantId: record.tenantId,
        correlationId: record.correlationId,
        eventType: 'BUSINESS_SIGNIFICANCE',
        actorType: 'SYSTEM',
        decision: record.decision,
        reasonCode: record.reason,
        metadata: {
          sourceModuleId: record.sourceModuleId,
          sourceEventType: record.eventType,
          sourceEventId: record.sourceEventId,
        },
      },
    });
  }
}
