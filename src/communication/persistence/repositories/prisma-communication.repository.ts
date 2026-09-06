import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { CommunicationRecord, CommunicationRepositoryPort } from '../ports/communication-repository.port';
import { aggregateCommunicationStatus } from '../../common/policies/communication-status.policy';

@Injectable()
export class PrismaCommunicationRepository implements CommunicationRepositoryPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async create(data: CommunicationRecord): Promise<CommunicationRecord> {
    return this.prisma.communication.create({
      data: {
        id: data.id,
        tenantId: data.tenantId,
        campaignId: data.campaignId ?? null,
        sourceModuleId: data.sourceModuleId,
        eventType: data.eventType,
        sourceEventId: data.sourceEventId,
        aggregateId: data.aggregateId,
        aggregateVersion: data.aggregateVersion,
        schemaVersion: data.schemaVersion,
        correlationId: data.correlationId,
        occurredAt: data.occurredAt,
        payload: data.payload as Prisma.InputJsonValue,
        status: data.status,
        version: data.version,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    }) as unknown as CommunicationRecord;
  }

  async findById(id: string, tenantId: string): Promise<CommunicationRecord | null> {
    const record = await this.prisma.communication.findFirst({
      where: { id, tenantId },
    });

    return (record ?? null) as CommunicationRecord | null;
  }

  async findActive(limit: number): Promise<CommunicationRecord[]> {
    const records = await this.prisma.communication.findMany({
      where: { status: { in: ['QUEUED', 'PROCESSING'] } },
      orderBy: { createdAt: 'asc' },
      take: Math.max(1, Math.min(Math.floor(limit), 1000)),
    });
    return records as unknown as CommunicationRecord[];
  }

  async refreshStatus(id: string, tenantId: string, now = new Date()): Promise<CommunicationRecord | null> {
    const communication = await this.prisma.communication.findFirst({ where: { id, tenantId } });
    if (!communication) return null;

    const deliveries = await this.prisma.delivery.findMany({
      where: { communicationId: id, tenantId },
      select: { status: true },
    });
    const nextStatus = aggregateCommunicationStatus(
      deliveries.map((delivery) => delivery.status),
      communication.status,
    );

    if (nextStatus !== communication.status) {
      // Optimistic versioning prevents a stale projector from overwriting a
      // newer lifecycle transition. The next reconciliation pass will retry
      // when another worker wins the race.
      await this.prisma.communication.updateMany({
        where: { id, tenantId, version: communication.version },
        data: {
          status: nextStatus,
          version: { increment: 1 },
          updatedAt: now,
        },
      });
    }

    return (await this.prisma.communication.findFirst({ where: { id, tenantId } })) as unknown as CommunicationRecord;
  }
}
