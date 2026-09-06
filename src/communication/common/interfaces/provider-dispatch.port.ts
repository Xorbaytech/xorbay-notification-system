import { DeliveryExecutionContext } from './delivery-execution-context.port';

export const PROVIDER_DISPATCH = Symbol('PROVIDER_DISPATCH');

export type ProviderDeliveryOutcome =
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'FAILED'
  | 'UNKNOWN';

export type ProviderFailureCategory =
  | 'TRANSIENT'
  | 'PERMANENT'
  | 'SYSTEMIC'
  | 'TIMEOUT_UNKNOWN'
  | 'UNSUPPORTED';

export interface ProviderDeliveryResult {
  readonly outcome: ProviderDeliveryOutcome;
  readonly providerMessageId?: string | null;
  readonly providerStatusReference?: string | null;
  readonly failureCategory?: ProviderFailureCategory | null;
  /**
   * Minimum delay requested by the downstream provider before retrying.
   * Adapters may populate this from a Retry-After response header; the
   * platform retry policy still applies its own deadline and jitter.
   */
  readonly retryAfterMs?: number | null;
  readonly occurredAt: Date;
}

export interface ProviderDispatchPort {
  dispatch(context: DeliveryExecutionContext): Promise<ProviderDeliveryResult>;
}
