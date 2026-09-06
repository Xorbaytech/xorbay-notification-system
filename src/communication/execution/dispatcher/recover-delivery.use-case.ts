import { randomUUID } from 'node:crypto';
import { TransactionContextPort } from '../../persistence/ports/transaction-context.port';
import { DeliveryRecord } from '../../persistence/ports/delivery-repository.port';
import { ClassifyFailureUseCase, FailureClassification } from './classify-failure.use-case';
import { EvaluateRetryUseCase } from './evaluate-retry.use-case';
import { EvaluateFallbackUseCase } from './evaluate-fallback.use-case';
import { ProviderDeliveryResult } from '../../common/interfaces/provider-dispatch.port';

export const DELIVERY_EXECUTION_WORK_TYPE = 'DELIVERY_EXECUTION' as const;

export interface RecoverDeliveryCommand {
  readonly tenantId: string;
  readonly communicationId: string;
  readonly deliveryId: string;
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly firstAttemptAt: Date;
  readonly channel: string;
  readonly correlationId: string;
  readonly deliveryVersion: number;
  readonly providerResult: ProviderDeliveryResult;
}

export interface RecoveryOutcome {
  readonly action: 'RETRY' | 'FALLBACK' | 'TERMINAL';
  readonly classification: FailureClassification;
  readonly newDeliveryId?: string;
  readonly reason: string;
}

/**
 * RecoverDeliveryUseCase — orchestrates the failure classification →
 * retry/fallback/terminal decision → durable persistence path.
 *
 * Architecture rules (LLD-06 §15–17 + SPEC-009):
 * - Retry = same Delivery + new Attempt (Delivery moved to RETRYING, then QUEUED)
 * - Fallback = new Delivery under same Communication
 * - All decisions persist atomically via TransactionalOutbox before BullMQ
 * - Retry never counts BullMQ retries
 * - AMBIGUOUS/SYSTEMIC failures do NOT automatically retry without reconciliation
 */
export class RecoverDeliveryUseCase {
  constructor(
    private readonly txContext: TransactionContextPort,
    private readonly classifier: ClassifyFailureUseCase,
    private readonly retryPolicy: EvaluateRetryUseCase,
    private readonly fallbackPolicy: EvaluateFallbackUseCase,
  ) {}

  async execute(command: RecoverDeliveryCommand): Promise<RecoveryOutcome> {
    const { classification, reason: classificationReason } = this.classifier.classify(
      command.providerResult.failureCategory ?? null,
    );

    if (classification === 'SYSTEMIC' || classification === 'AMBIGUOUS') {
      // Operator review required — mark terminal (DLQ-eligible) without retry
      await this.persistTerminal(command, classification, classificationReason);
      return { action: 'TERMINAL', classification, reason: classificationReason };
    }

    if (classification === 'TRANSIENT') {
      const retryDecision = this.retryPolicy.evaluate({
        currentAttemptNumber: command.attemptNumber,
        firstAttemptAt: command.firstAttemptAt,
        retryAfterMs: command.providerResult.retryAfterMs,
      });

      if (retryDecision.shouldRetry) {
        await this.persistRetry(command, retryDecision.delayMs, retryDecision.nextAttemptNumber);
        return { action: 'RETRY', classification, reason: retryDecision.reason };
      }

      // Retry exhausted — try fallback for TRANSIENT too (chain into PERMANENT path)
    }

    // PERMANENT failure or retry-exhausted TRANSIENT: evaluate fallback
    const fallbackDecision = await this.evaluateFallbackWithCount(command, classification);

    if (fallbackDecision.shouldFallback && fallbackDecision.nextChannel) {
      const newDeliveryId = randomUUID();
      await this.persistFallback(command, fallbackDecision.nextChannel, newDeliveryId);
      return {
        action: 'FALLBACK',
        classification,
        newDeliveryId,
        reason: `Fallback created: ${command.channel} → ${fallbackDecision.nextChannel}`,
      };
    }

    await this.persistTerminal(command, classification, fallbackDecision.reason);
    return { action: 'TERMINAL', classification, reason: fallbackDecision.reason };
  }

  private async evaluateFallbackWithCount(
    command: RecoverDeliveryCommand,
    _classification: FailureClassification,
  ): Promise<{ shouldFallback: boolean; nextChannel: string | null; reason: string }> {
    // Fallback limits apply to one logical recipient's delivery chain, not to
    // the whole communication. A broadcast may contain thousands of unrelated
    // deliveries; they must never consume one another's fallback budget.
    return this.txContext.run(async ({ deliveries }) => {
      const currentDelivery = await deliveries.findById(command.deliveryId, command.tenantId);
      const allDeliveries = await deliveries.findByCommunicationId(command.communicationId, command.tenantId);
      const deliveriesById = new Map(allDeliveries.map((delivery) => [delivery.id, delivery]));
      const existingFallbackCount = this.countFallbackAncestors(currentDelivery, deliveriesById);
      return this.fallbackPolicy.evaluate({
        failedChannel: command.channel,
        existingFallbackCount,
      });
    });
  }

  /**
   * Counts fallback records in the current delivery's lineage. The visited set
   * protects the decision path if corrupted data ever contains a cycle.
   */
  private countFallbackAncestors(
    delivery: DeliveryRecord | null,
    deliveriesById: ReadonlyMap<string, DeliveryRecord>,
  ): number {
    let count = 0;
    let current = delivery;
    const visited = new Set<string>();

    while (current?.fallbackOfDeliveryId) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      count += 1;
      current = deliveriesById.get(current.fallbackOfDeliveryId) ?? null;
    }

    return count;
  }

  private async persistRetry(
    command: RecoverDeliveryCommand,
    delayMs: number,
    _nextAttemptNumber: number,
  ): Promise<void> {
    const now = new Date();
    const availableAt = new Date(now.getTime() + delayMs);
    const publicationId = randomUUID();
    const stableJobKey = `${command.tenantId}:retry:${command.deliveryId}:${_nextAttemptNumber}`;

    await this.txContext.run(async ({ deliveries, queuePublications }) => {
      // Move delivery to RETRYING so worker re-claim is safe
      const delivery = await deliveries.findById(command.deliveryId, command.tenantId);
      if (!delivery) throw new Error(`Delivery not found during retry: ${command.deliveryId}`);

      await deliveries.update(command.deliveryId, command.tenantId, {
        status: 'RETRYING',
        version: delivery.version + 1,
      });

      // Persist durable retry publication (Transactional Outbox)
      await queuePublications.create({
        id: publicationId,
        tenantId: command.tenantId,
        aggregateType: 'DELIVERY',
        aggregateId: command.deliveryId,
        workType: DELIVERY_EXECUTION_WORK_TYPE,
        stableJobKey,
        status: 'PENDING',
        attemptCount: 0,
        availableAt,
        correlationId: command.correlationId,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  private async persistFallback(
    command: RecoverDeliveryCommand,
    nextChannel: string,
    newDeliveryId: string,
  ): Promise<void> {
    const now = new Date();
    const publicationId = randomUUID();
    const stableJobKey = `${command.tenantId}:fallback:${newDeliveryId}:1`;

    await this.txContext.run(async ({ deliveries, queuePublications }) => {
      // Mark original delivery as FAILED
      const original = await deliveries.findById(command.deliveryId, command.tenantId);
      if (!original) throw new Error(`Delivery not found during fallback: ${command.deliveryId}`);

      await deliveries.update(command.deliveryId, command.tenantId, {
        status: 'FAILED',
        version: original.version + 1,
      });

      // Create new fallback Delivery under same Communication
      const fallbackDelivery: DeliveryRecord = {
        id: newDeliveryId,
        communicationId: command.communicationId,
        tenantId: command.tenantId,
        channel: nextChannel,
        recipient: original.recipient,
        provider: original.provider ?? undefined,
        fallbackOfDeliveryId: command.deliveryId,
        status: 'PLANNED',
        attemptCount: 0,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };
      await deliveries.create(fallbackDelivery);

      // Durable publication for the fallback delivery
      await queuePublications.create({
        id: publicationId,
        tenantId: command.tenantId,
        aggregateType: 'DELIVERY',
        aggregateId: newDeliveryId,
        workType: DELIVERY_EXECUTION_WORK_TYPE,
        stableJobKey,
        status: 'PENDING',
        attemptCount: 0,
        availableAt: now,
        correlationId: command.correlationId,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  private async persistTerminal(
    command: RecoverDeliveryCommand,
    classification: FailureClassification,
    reason: string,
  ): Promise<void> {
    await this.txContext.run(async ({ deliveries, deadLetterRecords }) => {
      const delivery = await deliveries.findById(command.deliveryId, command.tenantId);
      if (!delivery) throw new Error(`Delivery not found during terminal: ${command.deliveryId}`);

      await deliveries.update(command.deliveryId, command.tenantId, {
        status: 'FAILED',
        version: delivery.version + 1,
      });

      await deadLetterRecords.create({
        id: randomUUID(),
        tenantId: command.tenantId,
        communicationId: command.communicationId,
        deliveryId: command.deliveryId,
        channel: command.channel,
        recipient: delivery.recipient,
        failureCode: classification,
        failureReason: reason,
        payload: command.providerResult as unknown as Record<string, unknown>,
        createdAt: new Date(),
      });
    });
  }
}
