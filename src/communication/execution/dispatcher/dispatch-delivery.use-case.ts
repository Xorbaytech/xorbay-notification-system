import { DeliveryExecutionContextPort } from '../../common/interfaces/delivery-execution-context.port';
import { ProviderRegistryPort } from '../../providers/ports/provider-registry.port';
import { QueueCommand } from '../../common/types/queue-command';
import { ClaimDeliveryExecutionUseCase } from './claim-delivery-execution.use-case';
import { DispatchDeliveryPort } from '../../common/interfaces/dispatch-delivery.port';
import { RecordDeliveryExecutionOutcomeUseCase } from './record-delivery-execution-outcome.use-case';
import { RecoverDeliveryUseCase } from './recover-delivery.use-case';
import { TemplateEnginePort, TEMPLATE_ENGINE } from '../../providers/template/template-engine.port';
import { Inject } from '@nestjs/common';

export const DELIVERY_EXECUTION_WORK_TYPE = 'DELIVERY_EXECUTION' as const;

export class DispatchDeliveryUseCase implements DispatchDeliveryPort {
  constructor(
    private readonly deliveryContext: DeliveryExecutionContextPort,
    private readonly claimDelivery: ClaimDeliveryExecutionUseCase,
    private readonly providerRegistry: ProviderRegistryPort,
    private readonly recordOutcome: RecordDeliveryExecutionOutcomeUseCase,
    private readonly recoverDelivery: RecoverDeliveryUseCase,
    @Inject(TEMPLATE_ENGINE) private readonly templateEngine: TemplateEnginePort,
  ) {}

  async dispatch(command: QueueCommand): Promise<void> {
    return this.execute(command);
  }

  async execute(command: QueueCommand): Promise<void> {
    if (command.workType !== DELIVERY_EXECUTION_WORK_TYPE) {
      throw new Error(`Unsupported queue work type: ${command.workType}`);
    }

    const context = await this.deliveryContext.resolve(command);

    if (!context || !context.executable) {
      return;
    }

    const claimed = await this.claimDelivery.execute(context);

    if (!claimed) {
      return;
    }

    const provider = this.providerRegistry.resolve({
      channel: claimed.channel,
      provider: claimed.provider,
    });

    // DB-backed render when available (subject + body); legacy engines fall
    // back to the simple render contract.
    let renderedContent: string | undefined;
    let renderedSubject: string | undefined;
    if (this.templateEngine.renderFor) {
      const rawPayload = claimed.payload ?? {};
      const contexts = rawPayload.__recipientContexts;
      const recipientContext = contexts && typeof contexts === 'object'
        ? (contexts as Record<string, Record<string, unknown>>)[claimed.recipient]
        : undefined;
      const renderPayload = {
        ...rawPayload,
        ...(recipientContext ?? {}),
        recipientName: recipientContext?.name ?? rawPayload.recipientName,
        recipientRole: recipientContext?.role ?? rawPayload.recipientRole,
        // Do not expose the internal fan-out map to templates/providers.
        __recipientContexts: undefined,
      };
      const rendered = await this.templateEngine.renderFor({
        tenantId: claimed.tenantId,
        sourceModuleId: claimed.sourceModuleId,
        eventType: claimed.eventType,
        identity:
          typeof claimed.payload?.templateIdentity === 'string'
            ? claimed.payload.templateIdentity
            : undefined,
        payload: renderPayload,
      });
      renderedContent = rendered.body;
      renderedSubject = rendered.subject;
    } else {
      renderedContent = await this.templateEngine.render(claimed.eventType, claimed.payload);
    }

    const contextWithContent = {
      ...claimed,
      content: renderedContent,
      subject: renderedSubject,
    };

    const result = await provider.dispatch(contextWithContent);

    // ERP-owned providers may complete synchronously (DELIVERED) or accept
    // work for asynchronous completion (ACCEPTED). Both are successful
    // outcomes and must not enter transient recovery.
    if (result.outcome === 'ACCEPTED' || result.outcome === 'DELIVERED') {
      await this.recordOutcome.record({
        tenantId: claimed.tenantId,
        deliveryId: claimed.deliveryId,
        attemptId: claimed.attemptId,
        status: 'SENT',
        providerRef: result.providerMessageId || undefined,
        sentAt: result.occurredAt,
      });
    } else {
      await this.recordOutcome.record({
        tenantId: claimed.tenantId,
        deliveryId: claimed.deliveryId,
        attemptId: claimed.attemptId,
        status: 'FAILED',
        providerRef: result.providerMessageId || undefined,
        sentAt: result.occurredAt,
      });

      await this.recoverDelivery.execute({
        tenantId: claimed.tenantId,
        communicationId: claimed.communicationId,
        deliveryId: claimed.deliveryId,
        attemptId: claimed.attemptId,
        attemptNumber: claimed.attemptNumber,
        firstAttemptAt: new Date(), // Ideally this comes from the delivery context, defaulting to now
        channel: claimed.channel,
        correlationId: claimed.correlationId,
        deliveryVersion: claimed.version + 1, // Incremented by recordOutcome
        providerResult: result,
      });
    }
  }
}
