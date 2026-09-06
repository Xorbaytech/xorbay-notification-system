import { Module } from '@nestjs/common';
import {
  RECIPIENT_RESOLUTION,
  RecipientResolutionPort,
} from './ports/recipient-resolution.port';
import { ErpRecipientResolverAdapter } from './adapters/erp-recipient.resolver';
import { ErpResolverRateLimiter } from './erp-resolver-rate-limiter.service';
import {
  FakePreferenceFixture,
  FakePreferenceResolver,
} from './fakes/fake-preference.resolver';
import {
  PREFERENCE_RESOLUTION,
  PreferenceResolutionPort,
} from './ports/preference-resolution.port';

/**
 * Kept for isolated platform tests.  ERP production events currently use the
 * mandatory IN_APP synthesis in OutboxProcessorCron; optional-channel
 * preference integration can be switched to a real adapter without changing
 * the orchestration ports.
 */
const MVP_PREFERENCE_FIXTURES: readonly FakePreferenceFixture[] = [
  {
    tenantId: 'tenant-fixture',
    sourceModuleId: 'attendance-fixture',
    recipientId: 'recipient-001',
    channel: 'EMAIL',
    decision: 'ALLOW',
  },
  {
    tenantId: 'tenant-fixture',
    sourceModuleId: 'attendance-fixture',
    recipientId: 'recipient-002',
    channel: 'SMS',
    decision: 'DENY',
  },
];

@Module({
  providers: [
    ErpResolverRateLimiter,
    {
      provide: RECIPIENT_RESOLUTION,
      useClass: ErpRecipientResolverAdapter,
    },
    {
      provide: PREFERENCE_RESOLUTION,
      useFactory: (): PreferenceResolutionPort =>
        new FakePreferenceResolver(MVP_PREFERENCE_FIXTURES),
    },
  ],
  exports: [RECIPIENT_RESOLUTION, PREFERENCE_RESOLUTION],
})
export class RecipientModule {}
