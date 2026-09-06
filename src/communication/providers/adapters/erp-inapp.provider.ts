import { Inject, Injectable, Optional } from '@nestjs/common';
import { ErpCallbackProvider } from './erp-callback.provider';
import {
  PROVIDER_EGRESS_RATE_LIMITER,
  ProviderEgressRateLimiterPort,
} from '../ports/provider-egress-rate-limiter.port';

/**
 * IN_APP channel — hands the rendered notification to the ERP, which persists
 * it into its per-user in-app feed (the bell Notification Center) and pushes it
 * over SSE. The ERP owns user identity; the platform owns retry/audit/DLQ.
 */
@Injectable()
export class ErpInAppProvider extends ErpCallbackProvider {
  protected readonly channelName = 'IN_APP';
  protected readonly providerName = 'ERP_IN_APP';

  constructor(
    @Optional()
    @Inject(PROVIDER_EGRESS_RATE_LIMITER)
    limiter?: ProviderEgressRateLimiterPort,
  ) {
    super(limiter);
  }
}
