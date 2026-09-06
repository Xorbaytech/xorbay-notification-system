import { ScheduleCommunicationUseCase, ScheduleCommunicationCommand } from './schedule-communication.use-case';
import { ScheduledPlanRepositoryPort } from '../../persistence/ports/scheduled-plan-repository.port';
import { DeliveryRepositoryPort } from '../../persistence/ports/delivery-repository.port';

const buildPlanRepo = (): jest.Mocked<ScheduledPlanRepositoryPort> => ({
  create: jest.fn().mockResolvedValue({}),
  findById: jest.fn().mockResolvedValue(null),
  findDueOneShotPlans: jest.fn().mockResolvedValue([]),
  findDueRecurringPlans: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue({}),
  cancelPlan: jest.fn().mockResolvedValue({}),
});

const buildDeliveryRepo = (): jest.Mocked<DeliveryRepositoryPort> => ({
  create: jest.fn().mockResolvedValue({}),
  findById: jest.fn().mockResolvedValue({
    id: 'del-1',
    communicationId: 'comm-1',
    tenantId: 'tenant-1',
    channel: 'EMAIL',
    recipient: 'user@example.com',
    status: 'PLANNED',
    attemptCount: 0,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  findByCommunicationId: jest.fn().mockResolvedValue([]),
  findByTenantAndStatus: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue({}),
  claimForExecution: jest.fn().mockResolvedValue(null),
});

const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

describe('ScheduleCommunicationUseCase', () => {
  it('persists a ONE_SHOT scheduled plan with future scheduledAt', async () => {
    const plans = buildPlanRepo();
    const deliveries = buildDeliveryRepo();
    const useCase = new ScheduleCommunicationUseCase(plans, deliveries);

    const command: ScheduleCommunicationCommand = {
      tenantId: 'tenant-1',
      deliveryId: 'del-1',
      correlationId: 'corr-1',
      mode: 'ONE_SHOT',
      scheduledAt: futureDate,
      timezone: 'Asia/Kolkata',
    };

    const result = await useCase.execute(command);

    expect(result.status).toBe('SCHEDULED');
    expect(result.mode).toBe('ONE_SHOT');
    expect(result.nextOccurrenceAt).toEqual(futureDate);
    expect(plans.create).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'ONE_SHOT', status: 'SCHEDULED', timezone: 'Asia/Kolkata' }),
    );
  });

  it('persists a RECURRING scheduled plan with future startsAt', async () => {
    const plans = buildPlanRepo();
    const deliveries = buildDeliveryRepo();
    const useCase = new ScheduleCommunicationUseCase(plans, deliveries);

    const command: ScheduleCommunicationCommand = {
      tenantId: 'tenant-1',
      deliveryId: 'del-1',
      correlationId: 'corr-1',
      mode: 'RECURRING',
      cronExpression: '0 9 * * *', // daily at 9am
      startsAt: futureDate,
      timezone: 'UTC',
    };

    const result = await useCase.execute(command);

    expect(result.status).toBe('SCHEDULED');
    expect(result.mode).toBe('RECURRING');
    expect(plans.create).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'RECURRING', cronExpression: '0 9 * * *' }),
    );
  });

  it('rejects past scheduledAt for ONE_SHOT', async () => {
    const useCase = new ScheduleCommunicationUseCase(buildPlanRepo(), buildDeliveryRepo());
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        deliveryId: 'del-1',
        correlationId: 'corr-1',
        mode: 'ONE_SHOT',
        scheduledAt: new Date(Date.now() - 60_000), // 1 minute ago
        timezone: 'UTC',
      }),
    ).rejects.toThrow('scheduledAt must be strictly future');
  });

  it('rejects past startsAt for RECURRING', async () => {
    const useCase = new ScheduleCommunicationUseCase(buildPlanRepo(), buildDeliveryRepo());
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        deliveryId: 'del-1',
        correlationId: 'corr-1',
        mode: 'RECURRING',
        cronExpression: '* * * * *',
        startsAt: new Date(Date.now() - 60_000),
        timezone: 'UTC',
      }),
    ).rejects.toThrow('startsAt must be strictly future');
  });

  it('rejects invalid IANA timezone', async () => {
    const useCase = new ScheduleCommunicationUseCase(buildPlanRepo(), buildDeliveryRepo());
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        deliveryId: 'del-1',
        correlationId: 'corr-1',
        mode: 'ONE_SHOT',
        scheduledAt: futureDate,
        timezone: 'Not/A/Valid/Timezone',
      }),
    ).rejects.toThrow('Invalid or missing IANA timezone');
  });

  it('rejects missing delivery', async () => {
    const deliveries = buildDeliveryRepo();
    deliveries.findById.mockResolvedValue(null);
    const useCase = new ScheduleCommunicationUseCase(buildPlanRepo(), deliveries);

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        deliveryId: 'del-missing',
        correlationId: 'corr-1',
        mode: 'ONE_SHOT',
        scheduledAt: futureDate,
        timezone: 'UTC',
      }),
    ).rejects.toThrow('Delivery not found');
  });

  it('requires cronExpression for RECURRING', async () => {
    const useCase = new ScheduleCommunicationUseCase(buildPlanRepo(), buildDeliveryRepo());
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        deliveryId: 'del-1',
        correlationId: 'corr-1',
        mode: 'RECURRING',
        startsAt: futureDate,
        timezone: 'UTC',
      }),
    ).rejects.toThrow('requires cronExpression');
  });
});
