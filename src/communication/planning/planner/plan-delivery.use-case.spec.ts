import { PlanDeliveryUseCase } from './plan-delivery.use-case';
import { DeliveryPlanningPort } from './delivery-planning.port';

describe('PlanDeliveryUseCase', () => {
  const context = {
    tenantId: 'tenant_001',
    sourceModuleId: 'attendance',
    eventType: 'AttendanceMarked',
    sourceEventId: 'evt_plan_001',
    correlationId: 'corr_plan_001',
    policyDecision: {
      decision: 'ALLOWED',
      reason: 'Policy allows this communication.',
    },
    recipients: [{ recipientId: 'student_001' }],
    finalizedContent: {
      channelContent: {
        subject: 'Attendance update',
        body: 'Your attendance has been marked absent.',
      },
    },
    scheduleConstraints: { mode: 'IMMEDIATE' },
    priorityConstraints: { priority: 'NORMAL' },
    retryConstraints: { policyContext: 'default' },
  };

  it('delegates the complete planning context to the delivery planning port', async () => {
    const result = {
      durablePlanCandidate: {
        deliveries: [{ recipientId: 'student_001' }],
      },
      evidence: [{ source: 'test-fixture' }],
    };

    const planner: DeliveryPlanningPort = {
      plan: jest.fn().mockResolvedValue(result),
    };

    const useCase = new PlanDeliveryUseCase(planner);

    await expect(useCase.execute(context)).resolves.toEqual(result);
    expect(planner.plan).toHaveBeenCalledWith(context);
  });

  it('preserves the planner result without applying application-level planning rules', async () => {
    const result = {
      durablePlanCandidate: {
        deliveries: [],
        reason: 'No eligible delivery tasks.',
      },
    };

    const planner: DeliveryPlanningPort = {
      plan: jest.fn().mockResolvedValue(result),
    };

    const useCase = new PlanDeliveryUseCase(planner);

    await expect(useCase.execute(context)).resolves.toBe(result);
    expect(planner.plan).toHaveBeenCalledTimes(1);
  });
});
