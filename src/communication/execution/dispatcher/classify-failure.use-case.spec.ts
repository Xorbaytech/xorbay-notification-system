import { ClassifyFailureUseCase } from './classify-failure.use-case';

describe('ClassifyFailureUseCase', () => {
  const classifier = new ClassifyFailureUseCase();

  it('classifies TRANSIENT provider category', () => {
    const result = classifier.classify('TRANSIENT');
    expect(result.classification).toBe('TRANSIENT');
  });

  it('classifies PERMANENT provider category', () => {
    const result = classifier.classify('PERMANENT');
    expect(result.classification).toBe('PERMANENT');
  });

  it('classifies SYSTEMIC provider category', () => {
    const result = classifier.classify('SYSTEMIC');
    expect(result.classification).toBe('SYSTEMIC');
  });

  it('classifies TIMEOUT_UNKNOWN as AMBIGUOUS', () => {
    const result = classifier.classify('TIMEOUT_UNKNOWN');
    expect(result.classification).toBe('AMBIGUOUS');
  });

  it('classifies UNSUPPORTED as AMBIGUOUS', () => {
    const result = classifier.classify('UNSUPPORTED');
    expect(result.classification).toBe('AMBIGUOUS');
  });

  it('classifies null as TRANSIENT (safe default for recovery)', () => {
    const result = classifier.classify(null);
    expect(result.classification).toBe('TRANSIENT');
  });

  it('classifies undefined as TRANSIENT (safe default for recovery)', () => {
    const result = classifier.classify(undefined);
    expect(result.classification).toBe('TRANSIENT');
  });

  it('classifies unknown string as TRANSIENT (safe default for recovery)', () => {
    const result = classifier.classify('UNKNOWN_CATEGORY');
    expect(result.classification).toBe('TRANSIENT');
  });
});
