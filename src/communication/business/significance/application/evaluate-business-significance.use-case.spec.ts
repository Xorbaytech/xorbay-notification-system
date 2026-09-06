import { EvaluateBusinessSignificanceUseCase } from './evaluate-business-significance.use-case';
import {
  BusinessSignificanceContext,
  BusinessSignificancePort,
} from '../ports/business-significance.port';

describe('EvaluateBusinessSignificanceUseCase', () => {
  const context: BusinessSignificanceContext = {
    tenantId: 'tenant_001',
    sourceModuleId: 'attendance',
    eventType: 'AttendanceMarked',
    sourceEventId: 'evt_significance_001',
    aggregateId: 'student_001',
    aggregateVersion: 1,
    schemaVersion: '1.0',
    correlationId: 'corr_significance_001',
    payload: {
      studentId: 'student_001',
      attendanceStatus: 'ABSENT',
    },
  };

  it('returns the evaluator decision and reason without owning the rule', async () => {
    const evaluator: BusinessSignificancePort = {
      evaluate: jest.fn().mockResolvedValue({
        decision: 'NOTIFY',
        reason: 'Attendance changed to ABSENT.',
      }),
    };

    const useCase = new EvaluateBusinessSignificanceUseCase(evaluator);

    await expect(useCase.execute(context)).resolves.toEqual({
      decision: 'NOTIFY',
      reason: 'Attendance changed to ABSENT.',
    });

    expect(evaluator.evaluate).toHaveBeenCalledWith(context);
  });

  it('preserves an IGNORE decision without invoking downstream behavior', async () => {
    const evaluator: BusinessSignificancePort = {
      evaluate: jest.fn().mockResolvedValue({
        decision: 'IGNORE',
        reason: 'Attendance value did not change.',
      }),
    };

    const useCase = new EvaluateBusinessSignificanceUseCase(evaluator);

    await expect(useCase.execute(context)).resolves.toEqual({
      decision: 'IGNORE',
      reason: 'Attendance value did not change.',
    });

    expect(evaluator.evaluate).toHaveBeenCalledTimes(1);
  });
});
