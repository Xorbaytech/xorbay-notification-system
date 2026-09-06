import { randomUUID } from 'node:crypto';
import { ScheduledPlanRepositoryPort } from '../../persistence/ports/scheduled-plan-repository.port';
import { DeliveryRepositoryPort } from '../../persistence/ports/delivery-repository.port';
import { BadRequestException, NotFoundException } from '@nestjs/common';

/**
 * SPEC-009 §4 / UC-04 — Schedule Communication Use Case.
 *
 * Validates a scheduling request and persists a durable ScheduledDeliveryPlan.
 *
 * Architecture invariants:
 * - Timezone is MANDATORY (IANA format, validated before persist).
 * - Past schedule rejected (trusted platform time, not publisher clock).
 * - Plan is persisted BEFORE returning scheduling success.
 * - Scheduler does NOT block inside the request lifecycle waiting for execution.
 * - ONE_SHOT: requires scheduledAt + timezone.
 * - RECURRING: requires cronExpression + startsAt + timezone (+ optional expiresAt).
 */

export interface ScheduleCommunicationCommand {
  readonly tenantId: string;
  readonly deliveryId: string;
  readonly correlationId: string;
  readonly mode: 'ONE_SHOT' | 'RECURRING';
  // ONE_SHOT fields
  readonly scheduledAt?: Date | null;
  // RECURRING fields
  readonly cronExpression?: string | null;
  readonly startsAt?: Date | null;
  readonly expiresAt?: Date | null;
  // Both modes
  readonly timezone: string;
}

export interface ScheduleCommunicationResult {
  readonly scheduledPlanId: string;
  readonly deliveryId: string;
  readonly mode: 'ONE_SHOT' | 'RECURRING';
  readonly status: 'SCHEDULED';
  readonly nextOccurrenceAt: Date | null;
  readonly timezone: string;
  readonly correlationId: string;
}

/** Known IANA timezone check using Intl.DateTimeFormat. */
function isValidIanaTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Compute next cron occurrence after a given reference time (simple next-minute resolution). */
function computeNextOccurrence(cronExpression: string, after: Date, timezone: string): Date | null {
  // Minimal cron computation using native Date (no paid library dependency).
  // For MVP: parse standard 5-field cron and find next matching minute.
  // Fields: minute hour day-of-month month day-of-week
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minuteExpr, hourExpr] = parts;

  // Parse field to set of values (handle * and specific values for hour/minute only for MVP)
  const parseField = (expr: string, min: number, max: number): Set<number> => {
    const values = new Set<number>();
    if (expr === '*') {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (expr.includes(',')) {
      expr.split(',').forEach((v) => values.add(parseInt(v, 10)));
    } else if (expr.includes('/')) {
      const [, step] = expr.split('/');
      const stepNum = parseInt(step, 10);
      for (let i = min; i <= max; i += stepNum) values.add(i);
    } else {
      values.add(parseInt(expr, 10));
    }
    return values;
  };

  const minutes = parseField(minuteExpr, 0, 59);
  const hours = parseField(hourExpr, 0, 23);

  // Search forward up to 48 hours for next matching time
  const candidate = new Date(after.getTime() + 60_000); // start from next minute
  candidate.setSeconds(0, 0);

  const maxSearch = new Date(after.getTime() + 48 * 60 * 60 * 1000);

  while (candidate <= maxSearch) {
    // Convert to target timezone for field comparison
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts2 = fmt.formatToParts(candidate);
    const hour = parseInt(parts2.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(parts2.find((p) => p.type === 'minute')?.value ?? '0', 10);

    if (hours.has(hour) && minutes.has(minute)) {
      return new Date(candidate);
    }

    candidate.setTime(candidate.getTime() + 60_000);
  }

  return null;
}

export class ScheduleCommunicationUseCase {
  constructor(
    private readonly plans: ScheduledPlanRepositoryPort,
    private readonly deliveries: DeliveryRepositoryPort,
  ) {}

  async execute(command: ScheduleCommunicationCommand): Promise<ScheduleCommunicationResult> {
    this.validate(command);

    const delivery = await this.deliveries.findById(command.deliveryId, command.tenantId);
    if (!delivery) {
      throw new NotFoundException(`Delivery not found: ${command.deliveryId}`);
    }

    const now = new Date();
    const planId = randomUUID();

    let nextOccurrenceAt: Date | null = null;

    if (command.mode === 'ONE_SHOT') {
      nextOccurrenceAt = command.scheduledAt!;
    } else {
      const referenceTime = command.startsAt ?? now;
      nextOccurrenceAt = computeNextOccurrence(command.cronExpression!, referenceTime, command.timezone);
    }

    await this.plans.create({
      id: planId,
      tenantId: command.tenantId,
      deliveryId: command.deliveryId,
      mode: command.mode,
      scheduledAt: command.scheduledAt ?? null,
      cronExpression: command.cronExpression ?? null,
      timezone: command.timezone,
      startsAt: command.startsAt ?? null,
      nextOccurrenceAt,
      expiresAt: command.expiresAt ?? null,
      status: 'SCHEDULED',
      scheduleVersion: 1,
      correlationId: command.correlationId,
      createdAt: now,
      updatedAt: now,
    });

    return {
      scheduledPlanId: planId,
      deliveryId: command.deliveryId,
      mode: command.mode,
      status: 'SCHEDULED',
      nextOccurrenceAt,
      timezone: command.timezone,
      correlationId: command.correlationId,
    };
  }

  private validate(command: ScheduleCommunicationCommand): void {
    if (!command.timezone || !isValidIanaTimezone(command.timezone)) {
      throw new BadRequestException(`Invalid or missing IANA timezone: '${command.timezone}'`);
    }

    const now = new Date();

    if (command.mode === 'ONE_SHOT') {
      if (!command.scheduledAt) {
        throw new BadRequestException('ONE_SHOT scheduling requires scheduledAt.');
      }
      if (command.scheduledAt <= now) {
        throw new BadRequestException(
          `scheduledAt must be strictly future. Received: ${command.scheduledAt.toISOString()}`,
        );
      }
    } else if (command.mode === 'RECURRING') {
      if (!command.cronExpression) {
        throw new BadRequestException('RECURRING scheduling requires cronExpression.');
      }
      if (!command.startsAt) {
        throw new BadRequestException('RECURRING scheduling requires startsAt.');
      }
      if (command.startsAt <= now) {
        throw new BadRequestException(
          `startsAt must be strictly future. Received: ${command.startsAt.toISOString()}`,
        );
      }
      if (command.expiresAt && command.expiresAt <= command.startsAt) {
        throw new BadRequestException('expiresAt must be after startsAt.');
      }
    } else {
      throw new BadRequestException(`Unknown schedule mode: ${(command as { mode: string }).mode}`);
    }
  }
}
