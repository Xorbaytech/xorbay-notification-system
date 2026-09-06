import { randomUUID } from 'node:crypto';
import { TransactionContextPort, TransactionScope } from '../../persistence/ports/transaction-context.port';
import { DeliveryRecord } from '../../persistence/ports/delivery-repository.port';
import { AttemptRecord } from '../../persistence/ports/attempt-repository.port';
import { EvaluateRetryUseCase } from './evaluate-retry.use-case';
import { DELIVERY_EXECUTION_WORK_TYPE } from './recover-delivery.use-case';

export interface RecoverStaleDeliveryCommand {
  readonly delivery: DeliveryRecord;
  readonly now: Date;
  readonly timeoutMs: number;
}

export interface StaleDeliveryRecoveryOutcome {
  readonly action: 'RETRY' | 'TERMINAL' | 'SKIPPED';
  readonly deliveryId: string;
  readonly reason: string;
}

/**
 * Reconciles a delivery whose worker execution lease expired.
 *
 * A worker can disappear after claiming a delivery but before recording the
 * provider outcome. Normal provider retry handling cannot see that failure,
 * so this path closes the in-flight attempt and re-enters the durable outbox.
 * Both state transitions use compare-and-swap (delivery/attempt version plus
 * PROCESSING status), making recovery safe across multiple service instances
 * and late provider callbacks.
 */
export class RecoverStaleDeliveryUseCase {
  constructor(
    private readonly transactionContext: TransactionContextPort,
    private readonly retryPolicy: EvaluateRetryUseCase,
  ) {}

  async execute(command: RecoverStaleDeliveryCommand): Promise<StaleDeliveryRecoveryOutcome> {
    const { delivery, now, timeoutMs } = command;

    return this.transactionContext.run(async (tx) => {
      const current = await tx.deliveries.findById(delivery.id, delivery.tenantId);
      if (!current || current.status !== 'PROCESSING' || current.version !== delivery.version) {
        return {
          action: 'SKIPPED',
          deliveryId: delivery.id,
          reason: 'Delivery is no longer owned by the expired execution lease.',
        };
      }

      const attempt = await tx.attempts.getLatestByDeliveryId(delivery.id, delivery.tenantId);
      if (!attempt || attempt.status !== 'PROCESSING') {
        return {
          action: 'SKIPPED',
          deliveryId: delivery.id,
          reason: 'No processing attempt is available for reconciliation.',
        };
      }

      const retryDecision = this.retryPolicy.evaluate({
        currentAttemptNumber: attempt.attemptNumber,
        firstAttemptAt: current.createdAt,
        now,
      });
      const failureReason = `Worker execution lease expired after ${timeoutMs}ms.`;
      const nextDeliveryStatus = retryDecision.shouldRetry ? 'RETRYING' : 'FAILED';

      const updatedDelivery = tx.deliveries.updateIfProcessingVersion
        ? await tx.deliveries.updateIfProcessingVersion(
            current.id,
            current.tenantId,
            current.version,
            { status: nextDeliveryStatus, version: current.version + 1, updatedAt: now },
          )
        : await this.updateLegacyDeliveryAdapter(tx, current, nextDeliveryStatus, now);

      if (!updatedDelivery) {
        return {
          action: 'SKIPPED',
          deliveryId: delivery.id,
          reason: 'Another worker or callback won the delivery version race.',
        };
      }

      const updatedAttempt = tx.attempts.updateIfProcessingVersion
        ? await tx.attempts.updateIfProcessingVersion(
            attempt.id,
            attempt.tenantId,
            attempt.version,
            {
              status: 'FAILED',
              responseCode: 'WORKER_TIMEOUT',
              errorMessage: failureReason,
              version: attempt.version + 1,
              updatedAt: now,
            },
          )
        : await this.updateLegacyAttemptAdapter(tx, attempt, failureReason, now);

      // If this fails, the transaction rolls back the delivery transition too;
      // the next reconciliation pass can safely try the complete operation.
      if (!updatedAttempt) {
        throw new Error(`Attempt ${attempt.id} changed before stale recovery completed.`);
      }

      if (!retryDecision.shouldRetry) {
        const communication = await tx.communications.findById(current.communicationId, current.tenantId);
        if (!communication) {
          throw new Error(`Communication not found during stale recovery: ${current.communicationId}`);
        }

        await tx.deadLetterRecords.create({
          id: randomUUID(),
          tenantId: current.tenantId,
          communicationId: current.communicationId,
          deliveryId: current.id,
          channel: current.channel,
          recipient: current.recipient,
          failureCode: 'WORKER_TIMEOUT',
          failureReason: `${failureReason} ${retryDecision.reason}`,
          payload: {
            source: 'stale-delivery-recovery',
            timeoutMs,
            attemptNumber: attempt.attemptNumber,
            communicationId: communication.id,
          },
          createdAt: now,
        });

        return {
          action: 'TERMINAL',
          deliveryId: delivery.id,
          reason: retryDecision.reason,
        };
      }

      const communication = await tx.communications.findById(current.communicationId, current.tenantId);
      if (!communication) {
        throw new Error(`Communication not found during stale recovery: ${current.communicationId}`);
      }

      const stableJobKey = `${current.tenantId}:stale-recovery:${current.id}:${retryDecision.nextAttemptNumber}`;
      const existingPublication = await tx.queuePublications.findByStableJobKey(
        current.tenantId,
        stableJobKey,
      );
      if (!existingPublication) {
        const priorPublication = await tx.queuePublications.findLatestByAggregateId?.(
          current.tenantId,
          current.id,
        );
        await tx.queuePublications.create({
          id: randomUUID(),
          tenantId: current.tenantId,
          aggregateType: 'Delivery',
          aggregateId: current.id,
          batchId: current.batchId ?? null,
          workType: DELIVERY_EXECUTION_WORK_TYPE,
          priority: priorPublication?.priority ?? 5,
          stableJobKey,
          payloadReference: null,
          status: 'PENDING',
          attemptCount: 0,
          availableAt: new Date(now.getTime() + retryDecision.delayMs),
          correlationId: communication.correlationId,
          createdAt: now,
          updatedAt: now,
        });
      }

      return {
        action: 'RETRY',
        deliveryId: delivery.id,
        reason: `${failureReason} ${retryDecision.reason}`,
      };
    });
  }

  private async updateLegacyDeliveryAdapter(
    tx: TransactionScope,
    current: DeliveryRecord,
    status: 'RETRYING' | 'FAILED',
    now: Date,
  ): Promise<DeliveryRecord | null> {
    const latest = await tx.deliveries.findById(current.id, current.tenantId);
    if (!latest || latest.status !== 'PROCESSING' || latest.version !== current.version) return null;
    return tx.deliveries.update(current.id, current.tenantId, {
      status,
      version: current.version + 1,
      updatedAt: now,
    });
  }

  private async updateLegacyAttemptAdapter(
    tx: TransactionScope,
    attempt: AttemptRecord,
    failureReason: string,
    now: Date,
  ): Promise<AttemptRecord | null> {
    const latest = await tx.attempts.getLatestByDeliveryId(attempt.deliveryId, attempt.tenantId);
    if (!latest || latest.id !== attempt.id || latest.status !== 'PROCESSING' || latest.version !== attempt.version) {
      return null;
    }
    return tx.attempts.update(attempt.id, attempt.tenantId, {
      status: 'FAILED',
      responseCode: 'WORKER_TIMEOUT',
      errorMessage: failureReason,
      version: attempt.version + 1,
      updatedAt: now,
    });
  }
}
