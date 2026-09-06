import { Injectable, Logger, Optional } from '@nestjs/common';
import { ErpResolverRateLimiter } from '../erp-resolver-rate-limiter.service';
import {
  RecipientResolutionContext,
  RecipientResolutionPort,
  RecipientResolutionResult,
  RecipientResolutionUnavailableError,
} from '../ports/recipient-resolution.port';

@Injectable()
export class ErpRecipientResolverAdapter implements RecipientResolutionPort {
  private readonly logger = new Logger(ErpRecipientResolverAdapter.name);
  private readonly erpApiUrl: string;
  private readonly resolverSecret: string;

  constructor(@Optional() private readonly rateLimiter?: ErpResolverRateLimiter) {
    // The ERP remains the identity/audience source of truth.  The shared
    // secret is optional for local development, but must be configured in
    // production (the ERP endpoint enforces it when present).
    this.erpApiUrl = process.env.ERP_API_URL || 'http://localhost:3001';
    this.resolverSecret =
      process.env.ERP_RECIPIENT_RESOLVER_SECRET ||
      process.env.ERP_CALLBACK_SECRET ||
      '';
  }

  async resolve(
    context: RecipientResolutionContext,
  ): Promise<RecipientResolutionResult> {
    this.logger.log(`Resolving recipients from ERP for ${context.sourceModuleId}:${context.eventType}`);

    // We assume the event payload contains the aggregateId.
    // If the event payload structure is known, we can extract it.
    // In our case, the aggregate.id is the studentId for attendance.
    const aggregateId = (context.event as any)?.aggregateId || (context.event as any)?.aggregate?.id;

    if (!aggregateId) {
      this.logger.warn(`No aggregateId found in event payload. Cannot resolve recipient from ERP.`);
      return {
        recipients: [],
        evidence: [
          {
            source: 'erp-recipient-resolver',
            outcome: 'NO_AGGREGATE_ID',
            tenantId: context.tenantId,
            sourceModuleId: context.sourceModuleId,
          },
        ],
      };
    }

    try {
      // eventType + payload let the ERP pick a per-event resolution strategy
      // (student→guardians, staff user, tenant admins, explicit recipient ids…).
      const params = new URLSearchParams({
        tenantId: context.tenantId,
        sourceModuleId: context.sourceModuleId,
        aggregateId,
      });
      if (context.eventType) params.set('eventType', context.eventType);
      const payload = (context.event as any)?.payload;
      if (payload && typeof payload === 'object') {
        // Cap the encoded payload so URLs stay within sane limits.
        const encoded = JSON.stringify(payload);
        if (encoded.length <= 6000) params.set('payload', encoded);
      }

      const url = `${this.erpApiUrl}/api/notification-integration/recipients?${params.toString()}`;
      const timeoutMs = this.readTimeoutMs();
      await this.rateLimiter?.acquire();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetch(url, {
          signal: controller.signal,
          headers: this.resolverSecret
            ? { 'x-notification-resolver-secret': this.resolverSecret }
            : undefined,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const message = `ERP responded with ${response.status} when resolving recipients`;
        this.logger.error(message);
        throw new RecipientResolutionUnavailableError(
          message,
          response.status,
          this.readRetryAfterMs(response),
        );
      }

      const raw = await response.json();
      // ERP's global response interceptor wraps controller results in
      // { success, data }. Accept both the wrapped contract and the direct
      // resolver response so recipient resolution remains transport-safe.
      const data = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
      return {
        recipients: data.recipients || [],
        evidence: data.evidence || [
          {
            source: 'erp-recipient-resolver',
            outcome: 'RECIPIENTS_FOUND',
            tenantId: context.tenantId,
            sourceModuleId: context.sourceModuleId,
          },
        ],
      };
    } catch (error) {
      if (error instanceof RecipientResolutionUnavailableError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to connect to ERP API: ${errorMessage}`);
      throw new RecipientResolutionUnavailableError(
        `ERP recipient resolution failed: ${errorMessage}`,
      );
    }
  }

  private readTimeoutMs(): number {
    const configured = Number(process.env.ERP_CALLBACK_TIMEOUT_MS ?? 10_000);
    return Number.isFinite(configured)
      ? Math.max(500, Math.min(Math.floor(configured), 60_000))
      : 10_000;
  }

  private readRetryAfterMs(response: Response): number | undefined {
    const value = response.headers?.get?.('retry-after');
    if (!value) {
      return undefined;
    }

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.floor(seconds * 1_000), 5 * 60_000);
    }

    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      return undefined;
    }
    return Math.min(Math.max(0, timestamp - Date.now()), 5 * 60_000);
  }
}
