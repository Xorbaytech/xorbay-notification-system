import { randomUUID } from 'node:crypto';
import {
  ScheduledPlanRecord,
  ScheduledPlanRepositoryPort,
} from '../../persistence/ports/scheduled-plan-repository.port';
import { ScheduledOccurrenceRepositoryPort } from '../../persistence/ports/scheduled-occurrence-repository.port';
import { QueuePublicationRepositoryPort } from '../../persistence/ports/queue-publication-repository.port';

/**
 * SPEC-009 §4 / UC-05 — Release Scheduled Delivery Use Case.
 *
 * Atomically claims a due ScheduledPlan occurrence and creates a durable
 * QueuePublication for the existing Delivery runtime.
 *
 * Architecture invariants (SPEC-009 §4 + LLD-06 §18):
 * - Release is atomic/idempotent via DB version predicate.
 * - Multiple scheduler instances must not release the same plan twice.
 * - 15-minute misfire window: occurrences older than 15 min become MISSED.
 * - No overlapping execution: if occurrence already CLAIMED/RELEASED, skip.
 * - Released occurrence enters the existing common Delivery runtime — NOT a new engine.
 * - DB state remains authoritative; queue handoff does not replace lifecycle state.
 */

export const MISFIRE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes per SPEC-009
export const SCHEDULE_RELEASE_WORK_TYPE = 'DELIVERY_EXECUTION' as const;

export interface ReleaseResult {
  readonly action: 'RELEASED' | 'MISSED' | 'EXPIRED' | 'ALREADY_CLAIMED' | 'SKIPPED';
  readonly scheduledPlanId: string;
  readonly occurrenceId?: string;
  readonly publicationId?: string;
  readonly reason: string;
}

/**
 * Compute the next cron occurrence after a reference time.
 * Exported for reuse in scheduler service.
 */
export function computeNextCronOccurrence(
  cronExpression: string,
  after: Date,
  timezone: string,
): Date | null {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [minuteExpr, hourExpr] = parts;

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

  const candidate = new Date(after.getTime() + 60_000);
  candidate.setSeconds(0, 0);

  const maxSearch = new Date(after.getTime() + 48 * 60 * 60 * 1000);

  while (candidate <= maxSearch) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const fmtParts = fmt.formatToParts(candidate);
    const hour = parseInt(fmtParts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(fmtParts.find((p) => p.type === 'minute')?.value ?? '0', 10);

    if (hours.has(hour) && minutes.has(minute)) {
      return new Date(candidate);
    }

    candidate.setTime(candidate.getTime() + 60_000);
  }

  return null;
}

export class ReleaseScheduledDeliveryUseCase {
  constructor(
    private readonly plans: ScheduledPlanRepositoryPort,
    private readonly occurrences: ScheduledOccurrenceRepositoryPort,
    private readonly publications: QueuePublicationRepositoryPort,
  ) {}

  /**
   * Release a single due scheduled plan occurrence.
   *
   * ONE_SHOT: create/claim the occurrence, publish delivery job, mark plan COMPLETED.
   * RECURRING: create/claim the occurrence, publish delivery job, advance nextOccurrenceAt.
   */
  async execute(plan: ScheduledPlanRecord, now: Date = new Date()): Promise<ReleaseResult> {
    // Guard: plan must be in SCHEDULED state
    if (plan.status !== 'SCHEDULED') {
      return { action: 'SKIPPED', scheduledPlanId: plan.id, reason: `Plan status is '${plan.status}', not SCHEDULED.` };
    }

    // Guard: plan must not be expired
    if (plan.expiresAt && plan.expiresAt <= now) {
      await this.plans.update(plan.id, plan.tenantId, { status: 'EXPIRED', scheduleVersion: plan.scheduleVersion + 1 });
      return { action: 'EXPIRED', scheduledPlanId: plan.id, reason: 'Plan expiry date reached.' };
    }

    const occurrenceAt = plan.mode === 'ONE_SHOT' ? plan.scheduledAt! : plan.nextOccurrenceAt!;

    if (!occurrenceAt) {
      return { action: 'SKIPPED', scheduledPlanId: plan.id, reason: 'No occurrence time available.' };
    }

    // SPEC-009 §4: 15-minute misfire window
    const ageMs = now.getTime() - occurrenceAt.getTime();
    if (ageMs > MISFIRE_WINDOW_MS) {
      // Occurrence is too old — mark MISSED; advance to next for recurring
      const occurrenceId = await this.ensureOccurrenceRecord(plan, occurrenceAt, now);
      await this.occurrences.markMissed(occurrenceId);

      if (plan.mode === 'RECURRING' && plan.cronExpression) {
        const next = computeNextCronOccurrence(plan.cronExpression, now, plan.timezone);
        await this.plans.update(plan.id, plan.tenantId, {
          nextOccurrenceAt: next,
          scheduleVersion: plan.scheduleVersion + 1,
        });
      } else {
        await this.plans.update(plan.id, plan.tenantId, { status: 'COMPLETED', scheduleVersion: plan.scheduleVersion + 1 });
      }

      return { action: 'MISSED', scheduledPlanId: plan.id, occurrenceId, reason: `Occurrence missed (${ageMs}ms > ${MISFIRE_WINDOW_MS}ms misfire window).` };
    }

    // Check for existing occurrence record (idempotency)
    const existing = await this.occurrences.findByPlanAndTime(plan.id, occurrenceAt);
    if (existing && (existing.status === 'CLAIMED' || existing.status === 'RELEASED')) {
      return { action: 'ALREADY_CLAIMED', scheduledPlanId: plan.id, occurrenceId: existing.id, reason: `Occurrence already ${existing.status}.` };
    }

    // Create or find occurrence record
    const occurrenceId = existing?.id ?? await this.createOccurrenceRecord(plan, occurrenceAt, now);
    const publicationId = randomUUID();
    const stableJobKey = `${plan.tenantId}:scheduled:${plan.deliveryId}:${occurrenceAt.toISOString()}`;

    // Atomic claim
    const claimed = await this.occurrences.claimForRelease(
      occurrenceId,
      existing?.version ?? 1,
      now,
      publicationId,
    );

    if (!claimed) {
      // Another scheduler instance claimed it first — idempotent skip
      return { action: 'ALREADY_CLAIMED', scheduledPlanId: plan.id, occurrenceId, reason: 'Concurrent claim lost; already claimed by another instance.' };
    }

    // Persist durable publication (Transactional Outbox)
    await this.publications.create({
      id: publicationId,
      tenantId: plan.tenantId,
      aggregateType: 'SCHEDULED_DELIVERY',
      aggregateId: plan.deliveryId,
      workType: SCHEDULE_RELEASE_WORK_TYPE,
      stableJobKey,
      status: 'PENDING',
      attemptCount: 0,
      availableAt: now,
      correlationId: plan.correlationId,
      createdAt: now,
      updatedAt: now,
    });

    await this.occurrences.markReleased(occurrenceId, now);

    // Advance plan state
    if (plan.mode === 'ONE_SHOT') {
      await this.plans.update(plan.id, plan.tenantId, { status: 'COMPLETED', scheduleVersion: plan.scheduleVersion + 1 });
    } else if (plan.cronExpression) {
      const next = computeNextCronOccurrence(plan.cronExpression, occurrenceAt, plan.timezone);
      await this.plans.update(plan.id, plan.tenantId, {
        nextOccurrenceAt: next ?? undefined,
        scheduleVersion: plan.scheduleVersion + 1,
      });
    }

    return {
      action: 'RELEASED',
      scheduledPlanId: plan.id,
      occurrenceId,
      publicationId,
      reason: `Occurrence at ${occurrenceAt.toISOString()} released.`,
    };
  }

  private async ensureOccurrenceRecord(plan: ScheduledPlanRecord, occurrenceAt: Date, now: Date): Promise<string> {
    const existing = await this.occurrences.findByPlanAndTime(plan.id, occurrenceAt);
    if (existing) return existing.id;
    return this.createOccurrenceRecord(plan, occurrenceAt, now);
  }

  private async createOccurrenceRecord(plan: ScheduledPlanRecord, occurrenceAt: Date, now: Date): Promise<string> {
    const occurrenceId = randomUUID();
    await this.occurrences.create({
      id: occurrenceId,
      scheduledPlanId: plan.id,
      occurrenceAt,
      status: 'PENDING',
      scheduleVersion: plan.scheduleVersion,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    return occurrenceId;
  }
}
