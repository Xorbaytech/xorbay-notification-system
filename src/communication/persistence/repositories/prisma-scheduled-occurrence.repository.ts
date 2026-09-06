import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ScheduledOccurrenceRecord,
  ScheduledOccurrenceRepositoryPort,
} from '../ports/scheduled-occurrence-repository.port';

@Injectable()
export class PrismaScheduledOccurrenceRepository implements ScheduledOccurrenceRepositoryPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async create(data: ScheduledOccurrenceRecord): Promise<ScheduledOccurrenceRecord> {
    const record = await this.prisma.scheduledOccurrence.create({
      data: {
        id: data.id,
        scheduledPlanId: data.scheduledPlanId,
        occurrenceAt: data.occurrenceAt,
        status: data.status,
        scheduleVersion: data.scheduleVersion,
        claimedAt: data.claimedAt ?? null,
        releasedAt: data.releasedAt ?? null,
        publicationId: data.publicationId ?? null,
        version: data.version,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    });
    return record as unknown as ScheduledOccurrenceRecord;
  }

  async findByPlanAndTime(scheduledPlanId: string, occurrenceAt: Date): Promise<ScheduledOccurrenceRecord | null> {
    const record = await this.prisma.scheduledOccurrence.findFirst({
      where: { scheduledPlanId, occurrenceAt },
    });
    return (record ?? null) as ScheduledOccurrenceRecord | null;
  }

  async claimForRelease(
    id: string,
    expectedVersion: number,
    claimedAt: Date,
    publicationId: string,
  ): Promise<ScheduledOccurrenceRecord | null> {
    const result = await this.prisma.scheduledOccurrence.updateMany({
      where: { id, version: expectedVersion, status: 'PENDING' },
      data: {
        status: 'CLAIMED',
        claimedAt,
        publicationId,
        version: { increment: 1 },
      },
    });

    if (result.count !== 1) return null;

    return (await this.prisma.scheduledOccurrence.findUnique({ where: { id } })) as unknown as ScheduledOccurrenceRecord;
  }

  async markReleased(id: string, releasedAt: Date): Promise<ScheduledOccurrenceRecord> {
    const record = await this.prisma.scheduledOccurrence.update({
      where: { id },
      data: { status: 'RELEASED', releasedAt, version: { increment: 1 } },
    });
    return record as unknown as ScheduledOccurrenceRecord;
  }

  async markMissed(id: string): Promise<ScheduledOccurrenceRecord> {
    const record = await this.prisma.scheduledOccurrence.update({
      where: { id },
      data: { status: 'MISSED', version: { increment: 1 } },
    });
    return record as unknown as ScheduledOccurrenceRecord;
  }

  async markExpired(id: string): Promise<ScheduledOccurrenceRecord> {
    const record = await this.prisma.scheduledOccurrence.update({
      where: { id },
      data: { status: 'EXPIRED', version: { increment: 1 } },
    });
    return record as unknown as ScheduledOccurrenceRecord;
  }
}
