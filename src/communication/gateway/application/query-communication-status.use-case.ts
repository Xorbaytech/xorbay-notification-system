import { Inject, Injectable } from '@nestjs/common';
import {
  CommunicationRepositoryPort,
  COMMUNICATION_REPOSITORY,
} from '../../persistence/ports/communication-repository.port';
import {
  DeliveryRepositoryPort,
  DELIVERY_REPOSITORY,
} from '../../persistence/ports/delivery-repository.port';
import {
  AttemptRepositoryPort,
  ATTEMPT_REPOSITORY,
} from '../../persistence/ports/attempt-repository.port';
import { DeliveryStatus } from '../../persistence/ports/delivery-repository.port';
import { aggregateCommunicationStatus } from './communication-status-aggregator';

/**
 * API-02 — Query Communication Status Use Case.
 *
 * Architecture rules:
 * - Read-only; no state mutations.
 * - Returns normalized lifecycle state; does NOT expose DB entity shape.
 * - Tenant-scoped; communicationId alone cannot leak across tenants.
 */

export interface CommunicationStatusResult {
  readonly communicationId: string;
  readonly tenantId: string;
  readonly status: string;
  readonly correlationId: string;
  readonly sourceEventId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deliveries: DeliveryStatusResult[];
}

export interface DeliveryStatusResult {
  readonly deliveryId: string;
  readonly channel: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly provider: string | null;
  readonly recipient: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly attempts: AttemptStatusResult[];
}

export interface AttemptStatusResult {
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly provider: string;
  readonly status: string;
  readonly responseCode: string | null;
  readonly errorMessage: string | null;
  readonly sentAt: Date | null;
  readonly createdAt: Date;
}

@Injectable()
export class QueryCommunicationStatusUseCase {
  constructor(
    @Inject(COMMUNICATION_REPOSITORY)
    private readonly communications: CommunicationRepositoryPort,
    @Inject(DELIVERY_REPOSITORY)
    private readonly deliveries: DeliveryRepositoryPort,
    @Inject(ATTEMPT_REPOSITORY)
    private readonly attempts: AttemptRepositoryPort,
  ) {}

  async execute(communicationId: string, tenantId: string): Promise<CommunicationStatusResult | null> {
    const communication = await this.communications.findById(communicationId, tenantId);
    if (!communication) return null;

    const allDeliveries = await this.deliveries.findByCommunicationId(communicationId, tenantId);

    const deliveryResults: DeliveryStatusResult[] = await Promise.all(
      allDeliveries.map(async (delivery) => {
        const deliveryAttempts = await this.attempts.findByDeliveryId(delivery.id, tenantId);

        const attemptResults: AttemptStatusResult[] = deliveryAttempts.map((a) => ({
          attemptId: a.id,
          attemptNumber: a.attemptNumber,
          provider: a.provider,
          status: a.status,
          responseCode: a.responseCode ?? null,
          errorMessage: a.errorMessage ?? null,
          sentAt: a.sentAt ?? null,
          createdAt: a.createdAt,
        }));

        return {
          deliveryId: delivery.id,
          channel: delivery.channel,
          status: delivery.status,
          attemptCount: delivery.attemptCount,
          provider: delivery.provider ?? null,
          recipient: delivery.recipient,
          createdAt: delivery.createdAt,
          updatedAt: delivery.updatedAt,
          attempts: attemptResults,
        };
      }),
    );

    const status = aggregateCommunicationStatus(
      deliveryResults.map((delivery) => delivery.status as DeliveryStatus),
      communication.status,
    );

    return {
      communicationId: communication.id,
      tenantId: communication.tenantId,
      status,
      correlationId: communication.correlationId,
      sourceEventId: communication.sourceEventId,
      createdAt: communication.createdAt,
      updatedAt: communication.updatedAt,
      deliveries: deliveryResults,
    };
  }
}
