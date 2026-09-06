import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ScheduledPlanRecord,
  ScheduledPlanRepositoryPort,
} from '../ports/scheduled-plan-repository.port';

@Injectable()
export class PrismaScheduledPlanRepository implements ScheduledPlanRepositoryPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async create(data: ScheduledPlanRecord): Promise<ScheduledPlanRecord> {
    const record = await this.prisma.scheduledDeliveryPlan.create({
      data: {
        id: data.id,
        tenantId: data.tenantId,
        deliveryId: data.deliveryId,
        mode: data.mode,
        scheduledAt: data.scheduledAt ?? null,
        cronExpression: data.cronExpression ?? null,
        timezone: data.timezone,
        startsAt: data.startsAt ?? null,
        nextOccurrenceAt: data.nextOccurrenceAt ?? null,
        expiresAt: data.expiresAt ?? null,
        status: data.status,
        scheduleVersion: data.scheduleVersion,
        correlationId: data.correlationId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
    });
    return record as unknown as ScheduledPlanRecord;
  }

  async findById(id: string, tenantId: string): Promise<ScheduledPlanRecord | null> {
    const record = await this.prisma.scheduledDeliveryPlan.findFirst({ where: { id, tenantId } });
    return (record ?? null) as ScheduledPlanRecord | null;
  }

  async findDueOneShotPlans(now: Date, tenantId?: string): Promise<ScheduledPlanRecord[]> {
    const records = await this.prisma.scheduledDeliveryPlan.findMany({
      where: {
        mode: 'ONE_SHOT',
        status: 'SCHEDULED',
        scheduledAt: { lte: now },
        ...(tenantId ? { tenantId } : {}),
      },
      orderBy: { scheduledAt: 'asc' },
    });
    return records as unknown as ScheduledPlanRecord[];
  }

  async findDueRecurringPlans(now: Date, tenantId?: string): Promise<ScheduledPlanRecord[]> {
    const records = await this.prisma.scheduledDeliveryPlan.findMany({
      where: {
        mode: 'RECURRING',
        status: 'SCHEDULED',
        nextOccurrenceAt: { lte: now },
        ...(tenantId ? { tenantId } : {}),
      },
      orderBy: { nextOccurrenceAt: 'asc' },
    });
    return records as unknown as ScheduledPlanRecord[];
  }

  async update(id: string, tenantId: string, data: Partial<ScheduledPlanRecord>): Promise<ScheduledPlanRecord> {
    const { id: _id, tenantId: _tid, ...changes } = data;
    const result = await this.prisma.scheduledDeliveryPlan.updateMany({
      where: { id, tenantId },
      data: changes,
    });

    if (result.count !== 1) {
      throw new Error(`ScheduledDeliveryPlan not found: ${id}`);
    }

    return (await this.prisma.scheduledDeliveryPlan.findFirst({ where: { id, tenantId } })) as unknown as ScheduledPlanRecord;
  }

  async cancelPlan(id: string, tenantId: string, expectedVersion: number): Promise<ScheduledPlanRecord | null> {
    const result = await this.prisma.scheduledDeliveryPlan.updateMany({
      where: {
        id,
        tenantId,
        scheduleVersion: expectedVersion,
        status: { in: ['SCHEDULED'] },
      },
      data: {
        status: 'CANCELLED',
        scheduleVersion: { increment: 1 },
      },
    });

    if (result.count !== 1) return null;

    return (await this.prisma.scheduledDeliveryPlan.findFirst({ where: { id, tenantId } })) as unknown as ScheduledPlanRecord;
  }
}
