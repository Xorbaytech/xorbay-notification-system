/**
 * Port for the ScheduledDeliveryPlan repository.
 *
 * Architecture: Scheduler state is PostgreSQL-authoritative.
 * Scheduler never calls providers; every release goes via QueuePublication.
 */

export type ScheduleMode = 'ONE_SHOT' | 'RECURRING';
export type ScheduledPlanStatus = 'SCHEDULED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';

export interface ScheduledPlanRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly deliveryId: string;
  readonly mode: ScheduleMode;
  readonly scheduledAt?: Date | null;
  readonly cronExpression?: string | null;
  readonly timezone: string;
  readonly startsAt?: Date | null;
  readonly nextOccurrenceAt?: Date | null;
  readonly expiresAt?: Date | null;
  readonly status: ScheduledPlanStatus;
  readonly scheduleVersion: number;
  readonly correlationId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ScheduledPlanRepositoryPort {
  create(data: ScheduledPlanRecord): Promise<ScheduledPlanRecord>;
  findById(id: string, tenantId: string): Promise<ScheduledPlanRecord | null>;
  findDueOneShotPlans(now: Date, tenantId?: string): Promise<ScheduledPlanRecord[]>;
  findDueRecurringPlans(now: Date, tenantId?: string): Promise<ScheduledPlanRecord[]>;
  update(id: string, tenantId: string, data: Partial<ScheduledPlanRecord>): Promise<ScheduledPlanRecord>;
  cancelPlan(id: string, tenantId: string, expectedVersion: number): Promise<ScheduledPlanRecord | null>;
}

export const SCHEDULED_PLAN_REPOSITORY = Symbol('SCHEDULED_PLAN_REPOSITORY');
