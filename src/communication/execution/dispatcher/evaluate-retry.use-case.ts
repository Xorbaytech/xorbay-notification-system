/**
 * Retry policy configuration — SPEC-009 §6 frozen values.
 *
 * - 3 retries after original attempt (total 4 executions max)
 * - Exponential backoff: base 5s, max 5 min, full jitter
 * - 30-minute absolute retry deadline from first attempt
 * - BullMQ retry is infrastructure recovery only; this policy governs business retry
 */
export interface RetryPolicyConfig {
  /** Maximum number of additional attempts after the original (SPEC-009: 3). */
  readonly maxRetries: number;
  /** Base backoff in milliseconds (SPEC-009: 5000ms). */
  readonly baseBackoffMs: number;
  /** Maximum backoff cap in milliseconds (SPEC-009: 300_000ms = 5 min). */
  readonly maxBackoffMs: number;
  /** Absolute retry deadline in milliseconds from first attempt (SPEC-009: 1_800_000ms = 30 min). */
  readonly retryDeadlineMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  maxRetries: 3,
  baseBackoffMs: 5_000,
  maxBackoffMs: 300_000,
  retryDeadlineMs: 1_800_000,
};

export interface RetryDecision {
  readonly shouldRetry: boolean;
  /** Backoff delay in milliseconds before the next attempt. */
  readonly delayMs: number;
  /** Next attempt number (1-based). */
  readonly nextAttemptNumber: number;
  readonly reason: string;
}

/**
 * EvaluateRetryUseCase — applies the frozen SPEC-009 retry policy.
 *
 * Architecture rules:
 * - Retry = same Delivery + new Attempt (never a new Delivery)
 * - Retry policy is NOT BullMQ retry configuration
 * - Full jitter: delay = random(0, min(cap, base * 2^attempt))
 */
export class EvaluateRetryUseCase {
  constructor(private readonly policy: RetryPolicyConfig = DEFAULT_RETRY_POLICY) {}

  evaluate(params: {
    /** Current attempt number (1-based; 1 = first attempt). */
    currentAttemptNumber: number;
    /** Timestamp of the first attempt for deadline enforcement. */
    firstAttemptAt: Date;
    /** Current time for deadline check. */
    now?: Date;
    /** Optional provider requested minimum delay (for example Retry-After). */
    retryAfterMs?: number | null;
  }): RetryDecision {
    const now = params.now ?? new Date();
    const elapsed = now.getTime() - params.firstAttemptAt.getTime();

    if (elapsed >= this.policy.retryDeadlineMs) {
      return {
        shouldRetry: false,
        delayMs: 0,
        nextAttemptNumber: params.currentAttemptNumber + 1,
        reason: `Retry deadline exceeded (${elapsed}ms >= ${this.policy.retryDeadlineMs}ms).`,
      };
    }

    if (params.currentAttemptNumber > this.policy.maxRetries) {
      return {
        shouldRetry: false,
        delayMs: 0,
        nextAttemptNumber: params.currentAttemptNumber + 1,
        reason: `Retry limit exhausted (${params.currentAttemptNumber} > ${this.policy.maxRetries}).`,
      };
    }

    // Full jitter: random(0, min(cap, base * 2^attempt))
    const exponentialCap = this.policy.baseBackoffMs * Math.pow(2, params.currentAttemptNumber);
    const cappedBackoff = Math.min(exponentialCap, this.policy.maxBackoffMs);
    const jitterDelayMs = Math.floor(Math.random() * cappedBackoff);
    const providerDelayMs = Number.isFinite(params.retryAfterMs)
      ? Math.max(0, Math.floor(params.retryAfterMs as number))
      : 0;
    const delayMs = Math.max(jitterDelayMs, providerDelayMs);

    // Do not create a retry that is already outside the frozen absolute
    // deadline. The delivery will instead go through the normal terminal/DLQ
    // path, preserving a durable operator-visible outcome.
    if (elapsed + delayMs >= this.policy.retryDeadlineMs) {
      return {
        shouldRetry: false,
        delayMs: 0,
        nextAttemptNumber: params.currentAttemptNumber + 1,
        reason: `Retry delay would exceed deadline (${elapsed + delayMs}ms >= ${this.policy.retryDeadlineMs}ms).`,
      };
    }

    return {
      shouldRetry: true,
      delayMs,
      nextAttemptNumber: params.currentAttemptNumber + 1,
      reason: `Retry ${params.currentAttemptNumber}/${this.policy.maxRetries} approved; delay ${delayMs}ms.`,
    };
  }
}
