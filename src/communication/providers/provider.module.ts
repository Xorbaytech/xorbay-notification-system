import { Module } from '@nestjs/common';
import { PROVIDER_REGISTRY } from './ports/provider-registry.port';
import { ProviderRegistry } from './registry/provider-registry';
import { FakeEmailProvider } from './adapters/fake-email.provider';
import { FakeSmsProvider } from './adapters/fake-sms.provider';
import { FakePushProvider } from './adapters/fake-push.provider';
import { SmtpProviderAdapter } from './adapters/smtp-provider.adapter';
import { ErpInAppProvider } from './adapters/erp-inapp.provider';
import { ErpWhatsappProvider } from './adapters/erp-whatsapp.provider';
import { FakeWhatsappProvider } from './adapters/fake-whatsapp.provider';
import { TEMPLATE_ENGINE } from './template/template-engine.port';
import { DbHandlebarsTemplateService } from './template/db-handlebars-template.service';
import { PrismaModule } from '../persistence/prisma.module';
import { ProviderEgressRateLimiter } from './provider-egress-rate-limiter.service';
import { PROVIDER_EGRESS_RATE_LIMITER } from './ports/provider-egress-rate-limiter.port';

@Module({
  imports: [PrismaModule],
  providers: [
    FakeEmailProvider,
    FakeSmsProvider,
    FakePushProvider,
    SmtpProviderAdapter,
    ErpInAppProvider,
    ErpWhatsappProvider,
    FakeWhatsappProvider,
    DbHandlebarsTemplateService,
    ProviderEgressRateLimiter,
    {
      provide: PROVIDER_EGRESS_RATE_LIMITER,
      useExisting: ProviderEgressRateLimiter,
    },
    {
      provide: TEMPLATE_ENGINE,
      useExisting: DbHandlebarsTemplateService,
    },
    {
      provide: ProviderRegistry,
      useFactory: (
        email: FakeEmailProvider,
        sms: FakeSmsProvider,
        push: FakePushProvider,
        smtp: SmtpProviderAdapter,
        inApp: ErpInAppProvider,
        whatsapp: ErpWhatsappProvider,
        fakeWhatsapp: FakeWhatsappProvider,
      ) =>
        new ProviderRegistry([
          { route: { channel: 'EMAIL', provider: 'FAKE_EMAIL' }, adapter: email },
          { route: { channel: 'EMAIL', provider: 'SMTP' }, adapter: smtp },
          { route: { channel: 'SMS', provider: 'FAKE_SMS' }, adapter: sms },
          { route: { channel: 'SMS', provider: 'SMS' }, adapter: sms },
          { route: { channel: 'PUSH', provider: 'FAKE_PUSH' }, adapter: push },
          { route: { channel: 'PUSH', provider: 'PUSH' }, adapter: push },
          { route: { channel: 'IN_APP', provider: 'ERP_IN_APP' }, adapter: inApp },
          { route: { channel: 'WHATSAPP', provider: 'ERP_WHATSAPP' }, adapter: whatsapp },
          { route: { channel: 'WHATSAPP', provider: 'FAKE_WHATSAPP' }, adapter: fakeWhatsapp },
        ]),
      inject: [
        FakeEmailProvider,
        FakeSmsProvider,
        FakePushProvider,
        SmtpProviderAdapter,
        ErpInAppProvider,
        ErpWhatsappProvider,
        FakeWhatsappProvider,
      ],
    },
    {
      provide: PROVIDER_REGISTRY,
      useExisting: ProviderRegistry,
    },
  ],
  exports: [PROVIDER_REGISTRY, TEMPLATE_ENGINE, PROVIDER_EGRESS_RATE_LIMITER],
})
export class ProviderModule {}
