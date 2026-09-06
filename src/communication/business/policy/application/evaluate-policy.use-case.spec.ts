import { EvaluatePolicyUseCase } from './evaluate-policy.use-case';
import { PolicyContext, PolicyPort } from '../ports/policy.port';

describe('EvaluatePolicyUseCase', () => {
  const context: PolicyContext = {
    tenantId: 'tenant_001',
    sourceModuleId: 'attendance',
    eventType: 'AttendanceMarked',
    sourceEventId: 'evt_policy_001',
    aggregateId: 'student_001',
    aggregateVersion: 1,
    schemaVersion: '1.0',
    correlationId: 'corr_policy_001',
    payload: {
      studentId: 'student_001',
      attendanceStatus: 'ABSENT',
    },
  };

  it('returns the policy decision without applying policy rules in the use case', async () => {
    const policy: PolicyPort = {
      evaluate: jest.fn().mockResolvedValue({
        decision: 'ALLOWED',
        reason: 'Policy allows this communication.',
      }),
    };

    const useCase = new EvaluatePolicyUseCase(policy);

    await expect(useCase.execute(context)).resolves.toEqual({
      decision: 'ALLOWED',
      reason: 'Policy allows this communication.',
    });

    expect(policy.evaluate).toHaveBeenCalledWith(context);
  });

  it('preserves an escalation level returned by the policy boundary', async () => {
    const policy: PolicyPort = {
      evaluate: jest.fn().mockResolvedValue({
        decision: 'ESCALATED',
        reason: 'Policy requires escalation.',
        escalationLevel: 'HIGH',
      }),
    };

    const useCase = new EvaluatePolicyUseCase(policy);

    await expect(useCase.execute(context)).resolves.toEqual({
      decision: 'ESCALATED',
      reason: 'Policy requires escalation.',
      escalationLevel: 'HIGH',
    });
  });
});
