import { Inject, Logger, Optional } from '@nestjs/common';
import { DeliveryExecutionContext } from '../../common/interfaces/delivery-execution-context.port';
import {
  ProviderDeliveryResult,
  ProviderDispatchPort,
} from '../../common/interfaces/provider-dispatch.port';
import {
  PROVIDER_EGRESS_RATE_LIMITER,
  ProviderEgressRateLimiterPort,
} from '../ports/provider-egress-rate-limiter.port';

/** Payload POSTed to the ERP delivery callback for every ERP-owned channel. */
export interface ErpDeliveryCallbackRequest {
  channel: string;
  tenantId: string;
  communicationId: string;
  deliveryId: string;
  eventType: string;
  recipient: string;
  content: string | undefined;
  subject?: string;
  payload: unknown;
  correlationId: string;
  attemptNumber: number;
}

/** Contract the ERP callback endpoint must answer with. */
interface ErpDeliveryCallbackResponse {
  outcome?: 'ACCEPTED' | 'DELIVERED' | 'FAILED' | 'UNKNOWN';
  failureCategory?: 'TRANSIENT' | 'PERMANENT' | 'SYSTEMIC' | 'TIMEOUT_UNKNOWN' | 'UNSUPPORTED' | null;
  providerMessageId?: string | null;
}

/**
 * Base adapter for channels whose real delivery machinery lives in the ERP
 * (IN_APP feed, WhatsApp connected-API gateway). The platform keeps ownership
 * of scheduling, retries, audit and DLQ; the ERP only executes the final hop.
 *
 * The ERP must expose:
 *   POST {ERP_API_URL}/api/notification-integration/deliveries
 *   header x-erp-callback-secret: ERP_CALLBACK_SECRET
 */
export abstract class ErpCallbackProvider implements ProviderDispatchPort {
  protected abstract readonly channelName: string;
  protected abstract readonly providerName: string;
  private readonly logger = new Logger(ErpCallbackProvider.name);

  constructor(
    @Optional()
    @Inject(PROVIDER_EGRESS_RATE_LIMITER)
    private readonly egressRateLimiter?: ProviderEgressRateLimiterPort,
  ) {}

  private readonly erpApiUrl = process.env.ERP_API_URL || 'http://localhost:3001';
  private readonly callbackSecret = process.env.ERP_CALLBACK_SECRET || '';
  private readonly timeoutMs = Number(process.env.ERP_CALLBACK_TIMEOUT_MS || 10000);

  async dispatch(context: DeliveryExecutionContext): Promise<ProviderDeliveryResult> {
    if (context.channel !== this.channelName) {
      return {
        outcome: 'FAILED',
        failureCategory: 'UNSUPPORTED',
        occurredAt: new Date(),
        providerMessageId: null,
        providerStatusReference: this.providerName,
      };
    }

    const permit = await this.egressRateLimiter?.acquire(
      (context.priority ?? 5) <= 2 ? 'CRITICAL' : 'STANDARD',
    );
    if (permit?.status === 'DEFERRED') {
      this.logger.warn(
        `Deferring ${this.channelName} callback for delivery ${context.deliveryId}: ${permit.reason ?? 'rate limit'}`,
      );
      return {
        outcome: 'FAILED',
        failureCategory: 'TRANSIENT',
        retryAfterMs: permit.retryAfterMs ?? null,
        occurredAt: new Date(),
        providerMessageId: null,
        providerStatusReference: this.providerName,
      };
    }

    const body: ErpDeliveryCallbackRequest = {
      channel: this.channelName,
      tenantId: context.tenantId,
      communicationId: context.communicationId,
      deliveryId: context.deliveryId,
      eventType: context.eventType,
      recipient: context.recipient,
      content: context.content,
      subject: context.subject,
      payload: context.payload,
      correlationId: context.correlationId,
      attemptNumber: context.attemptNumber,
    };

    try {
      const response = await fetch(`${this.erpApiUrl}/api/notification-integration/deliveries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-erp-callback-secret': this.callbackSecret,
          // A retry of the same logical delivery must be idempotent in ERP.
          // The ERP callback stores this value as its notification fingerprint.
          'x-idempotency-key': `${context.tenantId}:${context.deliveryId}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        // A callback response is a provider outcome, not an application
        // exception. 429/408/425 and 5xx responses are transient and must go
        // through the platform's durable retry path. Other 4xx responses are
        // permanent contract/authentication failures.
        const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
        const transient = isTransientHttpStatus(response.status);
        this.logger.warn(
          `ERP callback for ${this.channelName} delivery ${context.deliveryId} returned HTTP ${response.status}`,
        );
        return {
          outcome: 'FAILED',
          failureCategory: transient ? 'TRANSIENT' : 'PERMANENT',
          retryAfterMs,
          occurredAt: new Date(),
          providerMessageId: null,
          providerStatusReference: this.providerName,
        };
      }

      const raw = (await response.json().catch(() => ({}))) as
        | ErpDeliveryCallbackResponse
        | { data?: ErpDeliveryCallbackResponse };
      // ERP's global response interceptor wraps controller results in
      // { success, data }. Accept both the wrapped ERP contract and a direct
      // provider response so callback status is not misclassified as UNKNOWN.
      const result = ('data' in raw && raw.data ? raw.data : raw) as ErpDeliveryCallbackResponse;
      return {
        outcome: result.outcome ?? 'UNKNOWN',
        failureCategory: result.failureCategory ?? null,
        providerMessageId: result.providerMessageId ?? null,
        providerStatusReference: this.providerName,
        occurredAt: new Date(),
      };
    } catch (error) {
      // Network error / timeout contacting the ERP — retry later.
      this.logger.warn(
        `ERP callback for ${this.channelName} delivery ${context.deliveryId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        outcome: 'FAILED',
        failureCategory: 'TRANSIENT',
        occurredAt: new Date(),
        providerMessageId: null,
        providerStatusReference: this.providerName,
      };
    }
  }
}

export function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Parse both forms allowed by RFC 9110: delta-seconds or an HTTP date.
 * Invalid/negative values are ignored and the platform policy falls back to
 * its normal exponential backoff with jitter.
 */
export function parseRetryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const seconds = Number(normalized);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1_000);
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - now);
}
