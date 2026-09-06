import { Module } from '@nestjs/common';
import { PrismaModule } from '../persistence/prisma.module';
import { DELIVERY_EXECUTION_CONTEXT } from '../common/interfaces/delivery-execution-context.port';
import { PrismaDeliveryExecutionContext } from '../persistence/prisma-delivery-execution-context';
import { ClaimDeliveryExecutionUseCase } from './dispatcher/claim-delivery-execution.use-case';
import { RecordDeliveryExecutionOutcomeUseCase } from './dispatcher/record-delivery-execution-outcome.use-case';
import { DELIVERY_EXECUTION_OUTCOME } from '../common/interfaces/delivery-execution-outcome.port';
import { TRANSACTION_CONTEXT } from '../persistence/ports/transaction-context.port';
import { ScheduleCommunicationUseCase } from './dispatcher/schedule-communication.use-case';
import { ReleaseScheduledDeliveryUseCase } from './dispatcher/release-scheduled-delivery.use-case';
import { RecoverDeliveryUseCase } from './dispatcher/recover-delivery.use-case';
import { ClassifyFailureUseCase } from './dispatcher/classify-failure.use-case';
import { EvaluateRetryUseCase } from './dispatcher/evaluate-retry.use-case';
import { EvaluateFallbackUseCase } from './dispatcher/evaluate-fallback.use-case';
import { ProcessProviderCallbackUseCase } from './dispatcher/process-provider-callback.use-case';
import { DispatchDeliveryUseCase } from './dispatcher/dispatch-delivery.use-case';
import { ExecuteDeliveryJobUseCase } from './workers/execute-delivery-job.use-case';
import { DISPATCH_DELIVERY } from '../common/interfaces/dispatch-delivery.port';
import { ProviderModule } from '../providers/provider.module';
import { ProviderRegistry } from '../providers/registry/provider-registry';
import { PROVIDER_REGISTRY } from '../providers/ports/provider-registry.port';
import { DeliveryExecutionContextPort } from '../common/interfaces/delivery-execution-context.port';
import { ObservabilityModule } from '../observability/observability.module';
import { SCHEDULED_PLAN_REPOSITORY } from '../persistence/ports/scheduled-plan-repository.port';
import { DELIVERY_REPOSITORY } from '../persistence/ports/delivery-repository.port';
import { ScheduledPlanRepositoryPort } from '../persistence/ports/scheduled-plan-repository.port';
import { DeliveryRepositoryPort } from '../persistence/ports/delivery-repository.port';
import { TEMPLATE_ENGINE, TemplateEnginePort } from '../providers/template/template-engine.port';
import { QUEUE_PUBLICATION_REPOSITORY } from '../persistence/ports/queue-publication-repository.port';
import { PrismaQueuePublicationRepository } from '../persistence/repositories/prisma-queue-publication.repository';
import { ScheduleModule } from '@nestjs/schedule';
import { OutboxProcessorCron } from './workers/outbox-processor.cron';
import { BusinessModule } from '../business/business.module';
import { PROCESSED_EVENT_REPOSITORY } from '../persistence/ports/processed-event-repository.port';
import { PrismaProcessedEventRepository } from '../persistence/repositories/prisma-processed-event.repository';
import { MetricsService } from '../observability/metrics.service';
import { TransactionContextPort } from '../persistence/ports/transaction-context.port';
import { SchedulerCron } from './workers/scheduler.cron';
import { RequeueDeadLetterUseCase } from './workers/requeue-dead-letter.use-case';
import { SCHEDULED_OCCURRENCE_REPOSITORY } from '../persistence/ports/scheduled-occurrence-repository.port';
import { ProviderCallbackLedgerService } from './dispatcher/provider-callback-ledger.service';
import { RecoverStaleDeliveryUseCase } from './dispatcher/recover-stale-delivery.use-case';
import { DeliveryRecoveryCron } from './workers/delivery-recovery.cron';

@Module({
  imports: [
    PrismaModule,
    ProviderModule,
    ObservabilityModule,
    BusinessModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    PrismaDeliveryExecutionContext,
    {
      provide: DELIVERY_EXECUTION_CONTEXT,
      useExisting: PrismaDeliveryExecutionContext,
    },
    {
      provide: ClaimDeliveryExecutionUseCase,
      useFactory: (tx: TransactionContextPort) => new ClaimDeliveryExecutionUseCase(tx),
      inject: [TRANSACTION_CONTEXT],
    },
    {
      provide: RecordDeliveryExecutionOutcomeUseCase,
      useFactory: (tx: TransactionContextPort, metrics: MetricsService) =>
        new RecordDeliveryExecutionOutcomeUseCase(tx, metrics),
      inject: [TRANSACTION_CONTEXT, MetricsService],
    },
    {
      provide: DELIVERY_EXECUTION_OUTCOME,
      useExisting: RecordDeliveryExecutionOutcomeUseCase,
    },
    { provide: ClassifyFailureUseCase, useValue: new ClassifyFailureUseCase() },
    { provide: EvaluateRetryUseCase, useValue: new EvaluateRetryUseCase() },
    { provide: EvaluateFallbackUseCase, useValue: new EvaluateFallbackUseCase() },
    {
      provide: RecoverDeliveryUseCase,
      useFactory: (
        tx: TransactionContextPort,
        classifier: ClassifyFailureUseCase,
        retryPolicy: EvaluateRetryUseCase,
        fallbackPolicy: EvaluateFallbackUseCase,
      ) => new RecoverDeliveryUseCase(tx, classifier, retryPolicy, fallbackPolicy),
      inject: [TRANSACTION_CONTEXT, ClassifyFailureUseCase, EvaluateRetryUseCase, EvaluateFallbackUseCase],
    },
    {
      provide: RecoverStaleDeliveryUseCase,
      useFactory: (tx: TransactionContextPort, retryPolicy: EvaluateRetryUseCase) =>
        new RecoverStaleDeliveryUseCase(tx, retryPolicy),
      inject: [TRANSACTION_CONTEXT, EvaluateRetryUseCase],
    },
    {
      provide: ScheduleCommunicationUseCase,
      useFactory: (plans: ScheduledPlanRepositoryPort, deliveries: DeliveryRepositoryPort) =>
        new ScheduleCommunicationUseCase(plans, deliveries),
      inject: [SCHEDULED_PLAN_REPOSITORY, DELIVERY_REPOSITORY],
    },
    {
      provide: ReleaseScheduledDeliveryUseCase,
      useFactory: (plans: any, occurrences: any, publications: any) => new ReleaseScheduledDeliveryUseCase(plans, occurrences, publications),
      inject: [SCHEDULED_PLAN_REPOSITORY, SCHEDULED_OCCURRENCE_REPOSITORY, QUEUE_PUBLICATION_REPOSITORY],
    },
    ProviderCallbackLedgerService,
    ProcessProviderCallbackUseCase,
    {
      provide: DispatchDeliveryUseCase,
      useFactory: (
        context: DeliveryExecutionContextPort,
        claim: ClaimDeliveryExecutionUseCase,
        registry: ProviderRegistry,
        recordOutcome: RecordDeliveryExecutionOutcomeUseCase,
        recoverDelivery: RecoverDeliveryUseCase,
        templateEngine: TemplateEnginePort
      ) =>
        new DispatchDeliveryUseCase(context, claim, registry, recordOutcome, recoverDelivery, templateEngine),
      inject: [
        DELIVERY_EXECUTION_CONTEXT,
        ClaimDeliveryExecutionUseCase,
        PROVIDER_REGISTRY,
        RecordDeliveryExecutionOutcomeUseCase,
        RecoverDeliveryUseCase,
        TEMPLATE_ENGINE
      ],
    },
    {
      provide: DISPATCH_DELIVERY,
      useExisting: DispatchDeliveryUseCase,
    },
    {
      provide: ExecuteDeliveryJobUseCase,
      useFactory: (dispatch: DispatchDeliveryUseCase) => new ExecuteDeliveryJobUseCase(dispatch),
      inject: [DISPATCH_DELIVERY],
    },
    {
      provide: QUEUE_PUBLICATION_REPOSITORY,
      useClass: PrismaQueuePublicationRepository,
    },
    OutboxProcessorCron,
    {
      provide: PROCESSED_EVENT_REPOSITORY,
      useClass: PrismaProcessedEventRepository,
    },
    SchedulerCron,
    DeliveryRecoveryCron,
    RequeueDeadLetterUseCase,
  ],
  exports: [
    DELIVERY_EXECUTION_CONTEXT,
    ClaimDeliveryExecutionUseCase,
    DELIVERY_EXECUTION_OUTCOME,
    RecoverDeliveryUseCase,
    RecoverStaleDeliveryUseCase,
    ScheduleCommunicationUseCase,
    ReleaseScheduledDeliveryUseCase,
    ProcessProviderCallbackUseCase,
    ExecuteDeliveryJobUseCase,
    RequeueDeadLetterUseCase,
  ],
})
export class ExecutionModule {}
