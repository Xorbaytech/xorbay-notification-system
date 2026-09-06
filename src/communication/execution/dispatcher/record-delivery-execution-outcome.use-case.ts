import { Inject, Injectable } from '@nestjs/common';
import {
  DeliveryExecutionOutcome,
  DeliveryExecutionOutcomePort,
} from '../../common/interfaces/delivery-execution-outcome.port';
import { TRANSACTION_CONTEXT, TransactionContextPort } from '../../persistence/ports/transaction-context.port';
import { MetricsService } from '../../observability/metrics.service';

@Injectable()
export class RecordDeliveryExecutionOutcomeUseCase implements DeliveryExecutionOutcomePort {
  constructor(
    @Inject(TRANSACTION_CONTEXT)
    private readonly transactionContext: TransactionContextPort,
    private readonly metrics: MetricsService,
  ) {}

  async record(outcome: DeliveryExecutionOutcome): Promise<void> {
    const { channel, provider } = await this.transactionContext.run(async ({ deliveries, attempts }) => {
      const attempt = await attempts.findById(outcome.attemptId, outcome.tenantId);

      if (!attempt || attempt.deliveryId !== outcome.deliveryId) {
        throw new Error(`Attempt not found: ${outcome.attemptId}`);
      }

      const delivery = await deliveries.findById(outcome.deliveryId, outcome.tenantId);

      if (!delivery) {
        throw new Error(`Delivery not found: ${outcome.deliveryId}`);
      }

      const deliveryChanges = {
        status: outcome.status,
        sentAt: outcome.sentAt ?? delivery.sentAt ?? null,
        version: delivery.version + 1,
      };

      // Prefer the compare-and-set path so concurrent workers and late
      // callbacks cannot overwrite a newer terminal state. The fallback keeps
      // lightweight in-memory adapters and existing integrations compatible.
      if (deliveries.updateIfProcessingVersion) {
        const updated = await deliveries.updateIfProcessingVersion(
          outcome.deliveryId,
          outcome.tenantId,
          delivery.version,
          deliveryChanges,
        );
        if (!updated) return { channel: delivery.channel, provider: attempt.provider };
      }

      await attempts.update(outcome.attemptId, outcome.tenantId, {
        status: outcome.status,
        providerRef: outcome.providerRef ?? attempt.providerRef ?? null,
        responseCode: outcome.responseCode ?? null,
        errorMessage: outcome.errorMessage ?? null,
        sentAt: outcome.sentAt ?? attempt.sentAt ?? null,
        version: attempt.version + 1,
      });

      if (!deliveries.updateIfProcessingVersion) {
        await deliveries.update(outcome.deliveryId, outcome.tenantId, deliveryChanges);
      }

      return { channel: delivery.channel, provider: attempt.provider };
    });

    if (outcome.status === 'DELIVERED' || outcome.status === 'FAILED' || outcome.status === 'SENT') {
      const mappedOutcome = outcome.status === 'SENT' ? 'DELIVERED' : outcome.status;
      // We will record 'DELIVERED' or 'FAILED' for metrics
      this.metrics.recordDeliveryOutcome(outcome.tenantId, channel, provider, mappedOutcome as any);
    }
  }
}
