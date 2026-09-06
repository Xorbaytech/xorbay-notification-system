import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RecipientModule } from '../recipient/recipient.module';
import { TemplateModule } from '../template/template.module';
import { PrismaModule } from '../persistence/prisma.module';
import { ProcessCommunicationUseCase } from './lifecycle/process-communication.use-case';
import { BUSINESS_SIGNIFICANCE } from './significance/ports/business-significance.port';
import { POLICY } from './policy/ports/policy.port';
import { TEMPLATE_RESOLUTION } from '../template/ports/template.port';
import { PREFERENCE_RESOLUTION } from '../recipient/ports/preference-resolution.port';
import { PrismaTemplateRepository } from '../template/adapters/prisma-template.repository';
import { PrismaPreferenceResolver } from '../recipient/adapters/prisma-preference.resolver';
import { PrismaSignificanceAdapter } from './significance/adapters/prisma-significance.adapter';
import { PrismaPolicyAdapter } from './policy/adapters/prisma-policy.adapter';

const PrismaSignificanceProvider = {
  provide: BUSINESS_SIGNIFICANCE,
  useExisting: PrismaSignificanceAdapter,
};

const PrismaPolicyProvider = {
  provide: POLICY,
  useExisting: PrismaPolicyAdapter,
};

const PrismaPreferenceAdapter = {
  provide: PREFERENCE_RESOLUTION,
  useExisting: PrismaPreferenceResolver,
};

const PrismaTemplateAdapter = {
  provide: TEMPLATE_RESOLUTION,
  useExisting: PrismaTemplateRepository,
};

@Module({
  imports: [AuditModule, RecipientModule, TemplateModule, PrismaModule],
  providers: [
    // Phase 11: DB-backed Significance + Policy
    PrismaSignificanceAdapter,
    PrismaSignificanceProvider,
    PrismaPolicyAdapter,
    PrismaPolicyProvider,
    // RECIPIENT_RESOLUTION comes from RecipientModule (ErpRecipientResolverAdapter)
    // — no shadow binding; RecipientModule exports the ERP-backed resolver.
    // Override PREFERENCE_RESOLUTION with DB-backed resolver (RecipientsModule
    // provides a fixture-backed fake for standalone testing).
    PrismaPreferenceResolver,
    PrismaPreferenceAdapter,
    PrismaTemplateRepository,
    PrismaTemplateAdapter,
    ProcessCommunicationUseCase,
  ],
  exports: [ProcessCommunicationUseCase],
})
export class BusinessModule {}
