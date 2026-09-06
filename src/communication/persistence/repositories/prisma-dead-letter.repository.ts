import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  DeadLetterRecordDto,
  DeadLetterRepositoryPort,
} from '../ports/dead-letter-repository.port';

@Injectable()
export class PrismaDeadLetterRepository implements DeadLetterRepositoryPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async create(data: DeadLetterRecordDto): Promise<DeadLetterRecordDto> {
    const record = await this.prisma.deadLetterRecord.create({
      data: {
        ...data,
        payload: data.payload as any,
      },
    });
    return {
      ...record,
      payload: record.payload as Record<string, unknown>,
    };
  }

  async findByTenantId(tenantId: string): Promise<DeadLetterRecordDto[]> {
    const records = await this.prisma.deadLetterRecord.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((record) => ({
      ...record,
      payload: record.payload as Record<string, unknown>,
    }));
  }

  async findById(id: string, tenantId: string): Promise<DeadLetterRecordDto | null> {
    const record = await this.prisma.deadLetterRecord.findFirst({
      where: { id, tenantId },
    });
    if (!record) return null;
    return {
      ...record,
      payload: record.payload as Record<string, unknown>,
    };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.prisma.deadLetterRecord.deleteMany({
      where: { id, tenantId },
    });
  }
}
