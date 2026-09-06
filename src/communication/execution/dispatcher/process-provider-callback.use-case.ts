import { Inject, Injectable, Optional } from '@nestjs/common';
import { RecordDeliveryExecutionOutcomeUseCase } from './record-delivery-execution-outcome.use-case';
import { RecoverDeliveryUseCase } from './recover-delivery.use-case';
import { ProviderFailureCategory } from '../../common/interfaces/provider-dispatch.port';
import {
  AttemptRepositoryPort,
  ATTEMPT_REPOSITORY,
} from '../../persistence/ports/attempt-repository.port';
import {
  DeliveryRepositoryPort,
  DELIVERY_REPOSITORY,
} from '../../persistence/ports/delivery-repository.port';
import { ProviderCallbackLedgerService } from './provider-callback-ledger.service';

/**
 * API-06 — Provider Delivery Callback Contract
 *
 * Processes asynchronous webhooks from providers (e.g., SendGrid delivered, Twilio failed).
 * - Normalizes callback into standard outcome.
 * - Records outcome via RecordDeliveryExecutionOutcomeUseCase.
 * - If terminal failure, triggers RecoverDeliveryUseCase for retry/fallback.
 */

export interface ProcessProviderCallbackCommand {
  readonly tenantId: string;
  readonly provider?: string;
  readonly providerEventId?: string;
  readonly deliveryId: string;
  readonly attemptId: string;
  readonly outcome: 'DELIVERED' | 'FAILED';
  readonly providerRef?: string;
  readonly failureCategory?: ProviderFailureCategory;
  readonly responseCode?: string;
  readonly errorMessage?: string;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

@Injectable()
export class ProcessProviderCallbackUseCase {
  constructor(
    private readonly recordOutcome: RecordDeliveryExecutionOutcomeUseCase,
    private readonly recoverDelivery: RecoverDeliveryUseCase,
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: AttemptRepositoryPort,
    @Inject(DELIVERY_REPOSITORY) private readonly deliveries: DeliveryRepositoryPort,
    @Optional() private readonly callbackLedger?: ProviderCallbackLedgerService,
  ) {}

  async execute(command: ProcessProviderCallbackCommand): Promise<void> {
    const attempt = await this.attempts.findById(command.attemptId, command.tenantId);
    if (!attempt || attempt.deliveryId !== command.deliveryId) {
      throw new Error(`Attempt not found or mismatch: ${command.attemptId}`);
    }

    const delivery = await this.deliveries.findById(command.deliveryId, command.tenantId);
    if (!delivery) {
      throw new Error(`Delivery not found: ${command.deliveryId}`);
    }

    if (this.callbackLedger && command.provider && command.providerEventId) {
      const firstSeen = await this.callbackLedger.recordIfNew({
        tenantId: command.tenantId,
        provider: command.provider,
        providerEventId: command.providerEventId,
        deliveryId: command.deliveryId,
        attemptId: command.attemptId,
        outcome: command.outcome,
        payload: { responseCode: command.responseCode, errorMessage: command.errorMessage },
      });
      if (!firstSeen) return;
    }

    // A late callback must not regress a terminal successful delivery.
    if (delivery.status === 'SENT' || delivery.status === 'DELIVERED') return;

    // 1. Record the terminal outcome
    await this.recordOutcome.record({
      tenantId: command.tenantId,
      deliveryId: command.deliveryId,
      attemptId: command.attemptId,
      status: command.outcome,
      providerRef: command.providerRef,
      responseCode: command.responseCode,
      errorMessage: command.errorMessage,
      sentAt: command.occurredAt,
    });

    // 2. If it failed, evaluate recovery (Retry / Fallback)
    if (command.outcome === 'FAILED') {
      await this.recoverDelivery.execute({
        tenantId: command.tenantId,
        communicationId: delivery.communicationId,
        deliveryId: delivery.id,
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        firstAttemptAt: delivery.createdAt, // Using delivery creation as baseline for retry deadline
        channel: delivery.channel,
        correlationId: command.correlationId,
        deliveryVersion: delivery.version + 1, // Record outcome just incremented it
        providerResult: {
          outcome: 'FAILED',
          providerMessageId: command.providerRef,
          failureCategory: command.failureCategory ?? 'UNKNOWN' as any,
          occurredAt: command.occurredAt,
        },
      });
    }
  }
}
