/**
 * Failure classification result after normalizing provider outcome.
 * Drives retry/fallback/terminal routing per LLD-06 §15 and SPEC-009.
 */
export type FailureClassification = 'TRANSIENT' | 'PERMANENT' | 'SYSTEMIC' | 'AMBIGUOUS';

export interface ClassifyFailureResult {
  readonly classification: FailureClassification;
  readonly reason: string;
}

/**
 * ClassifyFailureUseCase — maps the provider adapter's normalized
 * ProviderFailureCategory into a platform-level routing decision.
 *
 * Architecture rule: failure classification happens before retry evaluation.
 * No provider-specific logic may leak here.
 */
export class ClassifyFailureUseCase {
  classify(providerCategory: string | null | undefined): ClassifyFailureResult {
    switch (providerCategory) {
      case 'TRANSIENT':
        return { classification: 'TRANSIENT', reason: 'Provider reported transient failure; retry eligible.' };

      case 'PERMANENT':
        return { classification: 'PERMANENT', reason: 'Provider reported permanent failure; fallback eligible.' };

      case 'SYSTEMIC':
        return { classification: 'SYSTEMIC', reason: 'Systemic infrastructure failure; operator review required.' };

      case 'TIMEOUT_UNKNOWN':
      case 'UNSUPPORTED':
        // UNKNOWN/AMBIGUOUS: do not blindly resend — SPEC-009 §8
        return {
          classification: 'AMBIGUOUS',
          reason: 'Ambiguous provider outcome (TIMEOUT_UNKNOWN/UNSUPPORTED); reconciliation required before retry.',
        };

      default:
        // No category / null: treat as TRANSIENT for recovery safety
        return {
          classification: 'TRANSIENT',
          reason: `Unclassified failure category '${providerCategory ?? 'null'}'; treated as TRANSIENT.`,
        };
    }
  }
}
