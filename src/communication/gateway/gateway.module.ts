import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { PrismaModule } from '../persistence/prisma.module';
import { ValidationModule } from '../validation/validation.module';
import { ExecutionModule } from '../execution/execution.module';
import { ObservabilityModule } from '../observability/observability.module';

// ─── Existing controllers ─────────────────────────────────────────────────────
import { EventController } from './api/event.controller';
import { CommunicationController } from './api/communication.controller';
import { ScheduleController } from './api/schedule.controller';
import { CallbackController } from './api/callback.controller';
import { HealthController } from './api/health.controller';

// ─── New management controllers ───────────────────────────────────────────────
import { TemplateController } from './api/template.controller';
import { RecipientController } from './api/recipient.controller';
import { PreferenceController } from './api/preference.controller';
import { RulesController } from './api/rules.controller';

// ─── Existing use cases ───────────────────────────────────────────────────────
import { IngestBusinessEventUseCase } from './application/ingest-business-event.use-case';
import { QueryCommunicationStatusUseCase } from './application/query-communication-status.use-case';
import { CancelCommunicationUseCase } from './application/cancel-communication.use-case';

// ─── New management use cases ─────────────────────────────────────────────────
import {
  CreateTemplateUseCase,
  ListTemplatesUseCase,
  GetTemplateUseCase,
  DeleteTemplateUseCase,
} from './application/management/template.use-cases';
import {
  UpsertRecipientUseCase,
  GetRecipientUseCase,
  ListRecipientsUseCase,
  DeleteRecipientUseCase,
} from './application/management/recipient.use-cases';
import {
  SetPreferenceUseCase,
  ListPreferencesUseCase,
  DeletePreferenceUseCase,
} from './application/management/preference.use-cases';
import {
  UpsertSignificanceRuleUseCase,
  ListSignificanceRulesUseCase,
  DeleteSignificanceRuleUseCase,
  UpsertPolicyRuleUseCase,
  ListPolicyRulesUseCase,
  DeletePolicyRuleUseCase,
} from './application/management/rules.use-cases';
import { BroadcastCommunicationUseCase } from './application/broadcast-communication.use-case';
import { DirectCommunicationUseCase } from './application/direct-communication.use-case';

// ─── Broadcast + Direct controllers ──────────────────────────────────────────
import { BroadcastController } from './api/broadcast.controller';
import { DirectController } from './api/direct.controller';
import { DlqController } from './api/dlq.controller';
import { RegisterPublisherController } from './api/register-publisher.controller';
import { RegisterPublisherUseCase } from './application/management/register-publisher.use-case';

// ─── Middleware ───────────────────────────────────────────────────────────────
import { RateLimitMiddleware } from './api/middlewares/rate-limit.middleware';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';

@Module({
  imports: [ValidationModule, PrismaModule, ExecutionModule, ObservabilityModule, InfrastructureModule],
  controllers: [
    // Existing
    EventController,
    CommunicationController,
    ScheduleController,
    CallbackController,
    HealthController,
    // Management API (Phase 10)
    TemplateController,
    RecipientController,
    PreferenceController,
    // Rules API (Phase 11)
    RulesController,
    // Broadcast API (Phase 13)
    BroadcastController,
    // Direct Communication API (Phase 14)
    DirectController,
    // DLQ API (Phase 15)
    DlqController,
    // Publisher self-registration (ERP integration)
    RegisterPublisherController,
  ],
  providers: [
    // Existing
    IngestBusinessEventUseCase,
    QueryCommunicationStatusUseCase,
    CancelCommunicationUseCase,
    // Template management
    CreateTemplateUseCase,
    ListTemplatesUseCase,
    GetTemplateUseCase,
    DeleteTemplateUseCase,
    // Recipient management
    UpsertRecipientUseCase,
    GetRecipientUseCase,
    ListRecipientsUseCase,
    DeleteRecipientUseCase,
    // Preference management
    SetPreferenceUseCase,
    ListPreferencesUseCase,
    DeletePreferenceUseCase,
    // Rules management (Phase 11)
    UpsertSignificanceRuleUseCase,
    ListSignificanceRulesUseCase,
    DeleteSignificanceRuleUseCase,
    UpsertPolicyRuleUseCase,
    ListPolicyRulesUseCase,
    DeletePolicyRuleUseCase,
    // Broadcast + Direct (Phases 13 + 14)
    BroadcastCommunicationUseCase,
    DirectCommunicationUseCase,
    // Publisher self-registration (ERP integration)
    RegisterPublisherUseCase,
  ],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RateLimitMiddleware)
      .forRoutes(
        EventController,
        CommunicationController,
        ScheduleController,
        TemplateController,
        RecipientController,
        PreferenceController,
      );
  }
}
