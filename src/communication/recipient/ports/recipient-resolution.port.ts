export const RECIPIENT_RESOLUTION = Symbol('RECIPIENT_RESOLUTION');

/**
 * Raised when the source-of-truth resolver is temporarily unavailable.
 *
 * An empty recipient list is a valid business result (for example, an event
 * with no guardians).  Transport failures must not be represented as an
 * empty list because doing so would allow the outbox worker to mark the event
 * processed and silently lose a notification.
 */
export class RecipientResolutionUnavailableError extends Error {
  readonly transient = true;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = 'RecipientResolutionUnavailableError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface RecipientResolutionContext {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  sourceEventId: string;
  correlationId: string;
  event: unknown;
  policyDecision: unknown;
}

export interface RecipientResolutionResult {
  recipients: readonly unknown[];
  evidence?: readonly unknown[];
}

export interface RecipientResolutionPort {
  resolve(context: RecipientResolutionContext): Promise<RecipientResolutionResult>;
}
