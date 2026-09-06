import { Inject, Injectable, Optional } from '@nestjs/common';
import { ErpCallbackProvider } from './erp-callback.provider';
import {
  PROVIDER_EGRESS_RATE_LIMITER,
  ProviderEgressRateLimiterPort,
} from '../ports/provider-egress-rate-limiter.port';

/**
 * WHATSAPP channel — delegates the actual send to the ERP's WhatsApp gateway
 * (per-academy connected Business API). Credentials and entitlement stay in
 * the ERP; the platform orchestrates scheduling, retries and dead-lettering.
 */
@Injectable()
export class ErpWhatsappProvider extends ErpCallbackProvider {
  protected readonly channelName = 'WHATSAPP';
  protected readonly providerName = 'ERP_WHATSAPP';

  constructor(
    @Optional()
    @Inject(PROVIDER_EGRESS_RATE_LIMITER)
    limiter?: ProviderEgressRateLimiterPort,
  ) {
    super(limiter);
  }
}
