import {
  ReleaseScheduledDeliveryUseCase,
  MISFIRE_WINDOW_MS,
} from './release-scheduled-delivery.use-case';
import { ScheduledPlanRecord } from '../../persistence/ports/scheduled-plan-repository.port';
import { ScheduledPlanRepositoryPort } from '../../persistence/ports/scheduled-plan-repository.port';
import { ScheduledOccurrenceRepositoryPort } from '../../persistence/ports/scheduled-occurrence-repository.port';
import { QueuePublicationRepositoryPort } from '../../persistence/ports/queue-publication-repository.port';

const now = new Date('2026-08-15T10:00:00Z');
const dueTime = new Date('2026-08-15T09:55:00Z'); // 5 min ago, within 15-min window

const basePlan: ScheduledPlanRecord = {
  id: 'plan-1',
  tenantId: 'tenant-1',
  deliveryId: 'del-1',
  mode: 'ONE_SHOT',
  scheduledAt: dueTime,
  timezone: 'UTC',
  status: 'SCHEDULED',
  scheduleVersion: 1,
  correlationId: 'corr-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const buildPlanRepo = (): jest.Mocked<ScheduledPlanRepositoryPort> => ({
  create: jest.fn().mockResolvedValue({}),
  findById: jest.fn().mockResolvedValue(basePlan),
  findDueOneShotPlans: jest.fn().mockResolvedValue([basePlan]),
  findDueRecurringPlans: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue({}),
  cancelPlan: jest.fn().mockResolvedValue({}),
});

const buildOccurrenceRepo = (): jest.Mocked<ScheduledOccurrenceRepositoryPort> => ({
  create: jest.fn().mockResolvedValue({ id: 'occ-1', version: 1 }),
  findByPlanAndTime: jest.fn().mockResolvedValue(null),
  claimForRelease: jest.fn().mockResolvedValue({ id: 'occ-1', status: 'CLAIMED', version: 2 }),
  markReleased: jest.fn().mockResolvedValue({}),
  markMissed: jest.fn().mockResolvedValue({}),
  markExpired: jest.fn().mockResolvedValue({}),
});

const buildPublicationRepo = (): jest.Mocked<QueuePublicationRepositoryPort> => ({
  create: jest.fn().mockResolvedValue({}),
  findByStableJobKey: jest.fn().mockResolvedValue(null),
  claimNext: jest.fn().mockResolvedValue(null),
  markAccepted: jest.fn().mockResolvedValue({}),
  markRecoveryRequired: jest.fn().mockResolvedValue({}),
});

describe('ReleaseScheduledDeliveryUseCase', () => {
  it('releases a due ONE_SHOT plan and creates a QueuePublication', async () => {
    const plans = buildPlanRepo();
    const occurrences = buildOccurrenceRepo();
    const publications = buildPublicationRepo();
    const useCase = new ReleaseScheduledDeliveryUseCase(plans, occurrences, publications);

    const result = await useCase.execute(basePlan, now);

    expect(result.action).toBe('RELEASED');
    expect(publications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workType: 'DELIVERY_EXECUTION',
        tenantId: 'tenant-1',
        aggregateId: 'del-1',
      }),
    );
    expect(plans.update).toHaveBeenCalledWith(
      'plan-1',
      'tenant-1',
      expect.objectContaining({ status: 'COMPLETED' }),
    );
  });

  it('marks occurrence as MISSED when outside the 15-min misfire window', async () => {
    const plans = buildPlanRepo();
    const occurrences = buildOccurrenceRepo();
    const publications = buildPublicationRepo();
    const useCase = new ReleaseScheduledDeliveryUseCase(plans, occurrences, publications);

    // Occurrence is 20 minutes old
    const staleTime = new Date(now.getTime() - MISFIRE_WINDOW_MS - 5 * 60 * 1000);
    const stalePlan: ScheduledPlanRecord = { ...basePlan, scheduledAt: staleTime };

    const result = await useCase.execute(stalePlan, now);

    expect(result.action).toBe('MISSED');
    expect(occurrences.markMissed).toHaveBeenCalled();
    expect(publications.create).not.toHaveBeenCalled();
  });

  it('skips a plan that is not in SCHEDULED status', async () => {
    const plans = buildPlanRepo();
    const occurrences = buildOccurrenceRepo();
    const publications = buildPublicationRepo();
    const useCase = new ReleaseScheduledDeliveryUseCase(plans, occurrences, publications);

    const cancelledPlan: ScheduledPlanRecord = { ...basePlan, status: 'CANCELLED' };
    const result = await useCase.execute(cancelledPlan, now);

    expect(result.action).toBe('SKIPPED');
    expect(publications.create).not.toHaveBeenCalled();
  });

  it('handles concurrent claim gracefully (idempotent skip)', async () => {
    const plans = buildPlanRepo();
    const occurrences = buildOccurrenceRepo();
    // Simulate concurrent claim: claimForRelease returns null (another instance won)
    occurrences.claimForRelease.mockResolvedValue(null);
    const publications = buildPublicationRepo();
    const useCase = new ReleaseScheduledDeliveryUseCase(plans, occurrences, publications);

    const result = await useCase.execute(basePlan, now);

    expect(result.action).toBe('ALREADY_CLAIMED');
    expect(publications.create).not.toHaveBeenCalled();
  });

  it('marks plan EXPIRED when expiresAt is in the past', async () => {
    const plans = buildPlanRepo();
    const occurrences = buildOccurrenceRepo();
    const publications = buildPublicationRepo();
    const useCase = new ReleaseScheduledDeliveryUseCase(plans, occurrences, publications);

    const expiredPlan: ScheduledPlanRecord = {
      ...basePlan,
      expiresAt: new Date(now.getTime() - 1000), // 1 second ago
    };

    const result = await useCase.execute(expiredPlan, now);

    expect(result.action).toBe('EXPIRED');
    expect(plans.update).toHaveBeenCalledWith(
      'plan-1',
      'tenant-1',
      expect.objectContaining({ status: 'EXPIRED' }),
    );
  });

  it('returns ALREADY_CLAIMED when occurrence is already CLAIMED in DB', async () => {
    const plans = buildPlanRepo();
    const occurrences = buildOccurrenceRepo();
    occurrences.findByPlanAndTime.mockResolvedValue({
      id: 'occ-1',
      scheduledPlanId: 'plan-1',
      occurrenceAt: dueTime,
      status: 'CLAIMED',
      scheduleVersion: 1,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const publications = buildPublicationRepo();
    const useCase = new ReleaseScheduledDeliveryUseCase(plans, occurrences, publications);

    const result = await useCase.execute(basePlan, now);

    expect(result.action).toBe('ALREADY_CLAIMED');
    expect(publications.create).not.toHaveBeenCalled();
  });
});
