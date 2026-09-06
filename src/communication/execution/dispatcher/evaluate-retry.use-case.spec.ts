import { EvaluateRetryUseCase, RetryPolicyConfig } from './evaluate-retry.use-case';

const FIXED_POLICY: RetryPolicyConfig = {
  maxRetries: 3,
  baseBackoffMs: 5_000,
  maxBackoffMs: 300_000,
  retryDeadlineMs: 1_800_000,
};

describe('EvaluateRetryUseCase (SPEC-009 frozen values)', () => {
  const policy = new EvaluateRetryUseCase(FIXED_POLICY);
  const firstAttemptAt = new Date('2026-08-15T10:00:00Z');

  it('approves retry for attempt 1 within deadline', () => {
    const result = policy.evaluate({
      currentAttemptNumber: 1,
      firstAttemptAt,
      now: new Date('2026-08-15T10:01:00Z'), // 1 minute after
    });
    expect(result.shouldRetry).toBe(true);
    expect(result.delayMs).toBeGreaterThanOrEqual(0);
    expect(result.delayMs).toBeLessThanOrEqual(FIXED_POLICY.maxBackoffMs);
    expect(result.nextAttemptNumber).toBe(2);
  });

  it('approves retry for attempt 2 within deadline', () => {
    const result = policy.evaluate({
      currentAttemptNumber: 2,
      firstAttemptAt,
      now: new Date('2026-08-15T10:05:00Z'),
    });
    expect(result.shouldRetry).toBe(true);
    expect(result.nextAttemptNumber).toBe(3);
  });

  it('approves retry for attempt 3 (last retry) within deadline', () => {
    const result = policy.evaluate({
      currentAttemptNumber: 3,
      firstAttemptAt,
      now: new Date('2026-08-15T10:10:00Z'),
    });
    expect(result.shouldRetry).toBe(true);
    expect(result.nextAttemptNumber).toBe(4);
  });

  it('rejects retry after 3 retries (attempt 4 = exhausted)', () => {
    const result = policy.evaluate({
      currentAttemptNumber: 4,
      firstAttemptAt,
      now: new Date('2026-08-15T10:15:00Z'),
    });
    expect(result.shouldRetry).toBe(false);
    expect(result.reason).toContain('limit exhausted');
  });

  it('rejects retry after 30-minute absolute deadline', () => {
    const result = policy.evaluate({
      currentAttemptNumber: 1,
      firstAttemptAt,
      now: new Date('2026-08-15T10:31:00Z'), // 31 minutes later
    });
    expect(result.shouldRetry).toBe(false);
    expect(result.reason).toContain('deadline exceeded');
  });

  it('respects deadline edge — exactly at 30 min is rejected', () => {
    const result = policy.evaluate({
      currentAttemptNumber: 1,
      firstAttemptAt,
      now: new Date(firstAttemptAt.getTime() + 1_800_000),
    });
    expect(result.shouldRetry).toBe(false);
  });

  it('produces delay within [0, maxBackoffMs]', () => {
    for (let i = 0; i < 20; i++) {
      const result = policy.evaluate({
        currentAttemptNumber: 1,
        firstAttemptAt,
        now: new Date('2026-08-15T10:01:00Z'),
      });
      expect(result.delayMs).toBeGreaterThanOrEqual(0);
      expect(result.delayMs).toBeLessThanOrEqual(FIXED_POLICY.maxBackoffMs);
    }
  });

  it('never retries sooner than a provider Retry-After delay', () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);

    const result = policy.evaluate({
      currentAttemptNumber: 1,
      firstAttemptAt,
      now: new Date('2026-08-15T10:01:00Z'),
      retryAfterMs: 7_000,
    });

    expect(result.shouldRetry).toBe(true);
    expect(result.delayMs).toBe(7_000);
    randomSpy.mockRestore();
  });

  it('does not schedule a provider-delayed retry beyond the absolute deadline', () => {
    const result = policy.evaluate({
      currentAttemptNumber: 1,
      firstAttemptAt,
      now: new Date(firstAttemptAt.getTime() + 1_795_000),
      retryAfterMs: 5_000,
    });

    expect(result.shouldRetry).toBe(false);
    expect(result.delayMs).toBe(0);
    expect(result.reason).toContain('would exceed deadline');
  });
});
