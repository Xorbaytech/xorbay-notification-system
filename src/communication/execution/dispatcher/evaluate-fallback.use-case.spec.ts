import { EvaluateFallbackUseCase, FALLBACK_CASCADE } from './evaluate-fallback.use-case';

describe('EvaluateFallbackUseCase (SPEC-009 max 1 fallback, EMAIL→SMS→PUSH)', () => {
  const policy = new EvaluateFallbackUseCase();

  it('falls back from EMAIL to SMS on first fallback', () => {
    const result = policy.evaluate({ failedChannel: 'EMAIL', existingFallbackCount: 0 });
    expect(result.shouldFallback).toBe(true);
    expect(result.nextChannel).toBe('SMS');
  });

  it('falls back from SMS to PUSH on first fallback', () => {
    const result = policy.evaluate({ failedChannel: 'SMS', existingFallbackCount: 0 });
    expect(result.shouldFallback).toBe(true);
    expect(result.nextChannel).toBe('PUSH');
  });

  it('does not fall back from PUSH (end of cascade)', () => {
    const result = policy.evaluate({ failedChannel: 'PUSH', existingFallbackCount: 0 });
    expect(result.shouldFallback).toBe(false);
    expect(result.nextChannel).toBeNull();
  });

  it('rejects second automatic fallback (SPEC-009 max 1)', () => {
    const result = policy.evaluate({ failedChannel: 'SMS', existingFallbackCount: 1 });
    expect(result.shouldFallback).toBe(false);
    expect(result.reason).toContain('Fallback limit reached');
  });

  it('rejects unknown channel', () => {
    const result = policy.evaluate({ failedChannel: 'PIGEON_POST', existingFallbackCount: 0 });
    expect(result.shouldFallback).toBe(false);
    expect(result.nextChannel).toBeNull();
  });

  it('reports unknown non-cascading channels before applying fallback limits', () => {
    const result = policy.evaluate({ failedChannel: 'IN_APP', existingFallbackCount: 177 });
    expect(result.shouldFallback).toBe(false);
    expect(result.nextChannel).toBeNull();
    expect(result.reason).toContain('Unknown channel');
  });

  it('cascade order matches EMAIL→SMS→PUSH', () => {
    expect(FALLBACK_CASCADE).toEqual(['EMAIL', 'SMS', 'PUSH']);
  });

  it('is case-insensitive for channel name', () => {
    const result = policy.evaluate({ failedChannel: 'email', existingFallbackCount: 0 });
    expect(result.shouldFallback).toBe(true);
    expect(result.nextChannel).toBe('SMS');
  });
});
