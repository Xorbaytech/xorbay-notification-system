import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { CampaignRecord, CampaignRepositoryPort } from '../ports/campaign-repository.port';

@Injectable()
export class PrismaCampaignRepository implements CampaignRepositoryPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async create(data: CampaignRecord): Promise<CampaignRecord> {
    const record = await this.prisma.campaign.create({
      data: {
        id: data.id,
        tenantId: data.tenantId,
        sourceModuleId: data.sourceModuleId,
        correlationId: data.correlationId,
        communicationId: data.communicationId ?? null,
        idempotencyKey: data.idempotencyKey ?? null,
        templateIdentity: data.templateIdentity,
        templateVersion: data.templateVersion,
        channel: data.channel,
        payload: data.payload as Prisma.InputJsonValue,
        status: data.status,
        totalRecipients: data.totalRecipients,
        totalBatches: data.totalBatches,
        completedBatches: data.completedBatches,
        failedBatches: data.failedBatches,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        startedAt: data.startedAt ?? null,
        completedAt: data.completedAt ?? null,
      },
    });
    return record as unknown as CampaignRecord;
  }

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<CampaignRecord | null> {
    const record = await this.prisma.campaign.findFirst({ where: { tenantId, idempotencyKey } });
    return (record ?? null) as CampaignRecord | null;
  }
}
