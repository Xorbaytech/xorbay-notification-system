import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AttemptRecord, AttemptRepositoryPort } from '../ports/attempt-repository.port';

@Injectable()
export class PrismaAttemptRepository implements AttemptRepositoryPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async create(data: AttemptRecord): Promise<AttemptRecord> {
    return this.prisma.attempt.create({
      data: {
        id: data.id,
        deliveryId: data.deliveryId,
        tenantId: data.tenantId,
        attemptNumber: data.attemptNumber,
        provider: data.provider,
        providerRef: data.providerRef ?? null,
        status: data.status,
        responseCode: data.responseCode ?? null,
        errorMessage: data.errorMessage ?? null,
        sentAt: data.sentAt ?? null,
        version: data.version,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    }) as unknown as AttemptRecord;
  }

  async findById(id: string, tenantId: string): Promise<AttemptRecord | null> {
    const record = await this.prisma.attempt.findFirst({ where: { id, tenantId } });
    return (record ?? null) as AttemptRecord | null;
  }

  async findByDeliveryId(deliveryId: string, tenantId: string): Promise<AttemptRecord[]> {
    const records = await this.prisma.attempt.findMany({
      where: { deliveryId, tenantId },
      orderBy: { attemptNumber: 'asc' },
    });
    return records as unknown as AttemptRecord[];
  }

  async update(id: string, tenantId: string, data: Partial<AttemptRecord>): Promise<AttemptRecord> {
    const { id: _ignoredId, tenantId: _ignoredTenantId, ...changes } = data;
    const result = await this.prisma.attempt.updateMany({
      where: { id, tenantId },
      data: changes,
    });

    if (result.count !== 1) {
      throw new Error(`Attempt not found: ${id}`);
    }

    return (await this.prisma.attempt.findFirst({ where: { id, tenantId } })) as unknown as AttemptRecord;
  }

  async updateIfProcessingVersion(
    id: string,
    tenantId: string,
    expectedVersion: number,
    data: Partial<AttemptRecord>,
  ): Promise<AttemptRecord | null> {
    const { id: _id, tenantId: _tenantId, ...changes } = data;
    const result = await this.prisma.attempt.updateMany({
      where: { id, tenantId, version: expectedVersion, status: 'PROCESSING' },
      data: changes,
    });
    if (result.count !== 1) return null;
    return (await this.prisma.attempt.findFirst({ where: { id, tenantId } })) as unknown as AttemptRecord;
  }

  async getLatestByDeliveryId(deliveryId: string, tenantId: string): Promise<AttemptRecord | null> {
    const record = await this.prisma.attempt.findFirst({
      where: { deliveryId, tenantId },
      orderBy: { attemptNumber: 'desc' },
    });
    return (record ?? null) as AttemptRecord | null;
  }
}
