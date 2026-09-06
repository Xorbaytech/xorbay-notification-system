/**
 * Port for the ScheduledOccurrence repository.
 *
 * Occurrence identity: scheduledPlanId + occurrenceAt (DB unique constraint).
 * An occurrence can be claimed only once — atomic version-guarded claim.
 */

export type OccurrenceStatus = 'PENDING' | 'CLAIMED' | 'RELEASED' | 'MISSED' | 'EXPIRED';

export interface ScheduledOccurrenceRecord {
  readonly id: string;
  readonly scheduledPlanId: string;
  readonly occurrenceAt: Date;
  readonly status: OccurrenceStatus;
  readonly scheduleVersion: number;
  readonly claimedAt?: Date | null;
  readonly releasedAt?: Date | null;
  readonly publicationId?: string | null;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ScheduledOccurrenceRepositoryPort {
  /** Create a new occurrence record (INSERT; uniqueness enforced by DB). */
  create(data: ScheduledOccurrenceRecord): Promise<ScheduledOccurrenceRecord>;

  /** Find a specific occurrence by scheduledPlanId + occurrenceAt. */
  findByPlanAndTime(scheduledPlanId: string, occurrenceAt: Date): Promise<ScheduledOccurrenceRecord | null>;

  /**
   * Atomically claim a PENDING occurrence for release.
   * Returns the claimed record or null if already claimed/version mismatch.
   */
  claimForRelease(
    id: string,
    expectedVersion: number,
    claimedAt: Date,
    publicationId: string,
  ): Promise<ScheduledOccurrenceRecord | null>;

  /** Mark occurrence as RELEASED after successful durable publication. */
  markReleased(id: string, releasedAt: Date): Promise<ScheduledOccurrenceRecord>;

  /** Mark occurrence as MISSED (outside misfire window). */
  markMissed(id: string): Promise<ScheduledOccurrenceRecord>;

  /** Mark occurrence as EXPIRED (plan expired before release). */
  markExpired(id: string): Promise<ScheduledOccurrenceRecord>;
}

export const SCHEDULED_OCCURRENCE_REPOSITORY = Symbol('SCHEDULED_OCCURRENCE_REPOSITORY');
