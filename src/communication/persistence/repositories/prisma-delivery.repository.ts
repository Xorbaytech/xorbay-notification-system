import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { DeliveryRecord, DeliveryRepositoryPort, DeliveryStatus } from '../ports/delivery-repository.port';

@Injectable()
export class PrismaDeliveryRepository implements DeliveryRepositoryPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async create(data: DeliveryRecord): Promise<DeliveryRecord> {
    return this.prisma.delivery.create({
      data: {
        id: data.id,
        communicationId: data.communicationId,
        batchId: data.batchId ?? null,
        tenantId: data.tenantId,
        channel: data.channel,
        recipient: data.recipient,
        provider: data.provider ?? null,
        fallbackOfDeliveryId: data.fallbackOfDeliveryId ?? null,
        status: data.status,
        attemptCount: data.attemptCount,
        version: data.version,
        scheduledAt: data.scheduledAt ?? null,
        sentAt: data.sentAt ?? null,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    }) as unknown as DeliveryRecord;
  }

  async findById(id: string, tenantId: string): Promise<DeliveryRecord | null> {
    const record = await this.prisma.delivery.findFirst({ where: { id, tenantId } });
    return (record ?? null) as DeliveryRecord | null;
  }

  async findByCommunicationId(communicationId: string, tenantId: string): Promise<DeliveryRecord[]> {
    const records = await this.prisma.delivery.findMany({
      where: { communicationId, tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return records as unknown as DeliveryRecord[];
  }

  async findByTenantAndStatus(tenantId: string, status: DeliveryStatus): Promise<DeliveryRecord[]> {
    const records = await this.prisma.delivery.findMany({
      where: { tenantId, status },
      orderBy: { createdAt: 'asc' },
    });
    return records as unknown as DeliveryRecord[];
  }

  async findStaleProcessing(olderThan: Date, limit: number): Promise<DeliveryRecord[]> {
    const safeLimit = Math.max(1, Math.min(Math.floor(limit), 500));
    const records = await this.prisma.delivery.findMany({
      where: {
        status: 'PROCESSING',
        updatedAt: { lt: olderThan },
      },
      orderBy: { updatedAt: 'asc' },
      take: safeLimit,
    });
    return records as unknown as DeliveryRecord[];
  }

  async update(id: string, tenantId: string, data: Partial<DeliveryRecord>): Promise<DeliveryRecord> {
    const { id: _ignoredId, tenantId: _ignoredTenantId, ...changes } = data;
    const record = await this.prisma.delivery.updateMany({
      where: { id, tenantId },
      data: changes,
    });

    if (record.count !== 1) {
      throw new Error(`Delivery not found: ${id}`);
    }

    return (await this.prisma.delivery.findFirst({ where: { id, tenantId } })) as unknown as DeliveryRecord;
  }

  async updateIfProcessingVersion(
    id: string,
    tenantId: string,
    expectedVersion: number,
    data: Partial<DeliveryRecord>,
  ): Promise<DeliveryRecord | null> {
    const { id: _id, tenantId: _tenantId, ...changes } = data;
    const result = await this.prisma.delivery.updateMany({
      where: { id, tenantId, version: expectedVersion, status: 'PROCESSING' },
      data: changes,
    });
    if (result.count !== 1) return null;
    return (await this.prisma.delivery.findFirst({ where: { id, tenantId } })) as unknown as DeliveryRecord;
  }

  async claimForExecution(
    id: string,
    tenantId: string,
    expectedVersion: number,
    now: Date,
  ): Promise<DeliveryRecord | null> {
    const result = await this.prisma.delivery.updateMany({
      where: {
        id,
        tenantId,
        version: expectedVersion,
        status: { in: ['PLANNED', 'QUEUED', 'RETRYING'] },
      },
      data: {
        status: 'PROCESSING',
        attemptCount: { increment: 1 },
        version: { increment: 1 },
        updatedAt: now,
      },
    });

    if (result.count !== 1) {
      return null;
    }

    return (await this.prisma.delivery.findFirst({
      where: { id, tenantId },
    })) as unknown as DeliveryRecord;
  }
}
