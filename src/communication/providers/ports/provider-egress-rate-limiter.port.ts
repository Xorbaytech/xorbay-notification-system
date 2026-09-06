/**
 * Outbound provider gate used immediately before a provider HTTP call.
 *
 * This is deliberately a port: the delivery/application layer does not know
 * whether the gate is backed by Redis, an in-memory limiter, or a managed
 * rate-limit service.  Providers only receive a decision and can feed a
 * deferred decision into the normal durable retry path.
 */
export const PROVIDER_EGRESS_RATE_LIMITER = Symbol('PROVIDER_EGRESS_RATE_LIMITER');

export type ProviderEgressPriority = 'CRITICAL' | 'STANDARD';

export interface ProviderEgressPermit {
  readonly status: 'ACQUIRED' | 'DEFERRED';
  /** Minimum delay before a deferred call should be tried again. */
  readonly retryAfterMs?: number;
  readonly reason?: string;
}

export interface ProviderEgressRateLimiterPort {
  acquire(priority?: ProviderEgressPriority): Promise<ProviderEgressPermit>;
}
