import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  COMMUNICATION_REPOSITORY,
  CommunicationRepositoryPort,
} from '../../persistence/ports/communication-repository.port';
import {
  DELIVERY_REPOSITORY,
  DeliveryRepositoryPort,
} from '../../persistence/ports/delivery-repository.port';
import {
  QUEUE_PUBLICATION_REPOSITORY,
  QueuePublicationRepositoryPort,
} from '../../persistence/ports/queue-publication-repository.port';
import { defaultProviderFor } from '../../common/types/channel-provider.routing';
import { TRANSACTION_CONTEXT, TransactionContextPort, TransactionScope } from '../../persistence/ports/transaction-context.port';

export interface DirectCommunicationCommand {
  tenantId: string;
  sourceModuleId: string;
  channel: string;
  recipient: string;
  templateIdentity: string;
  templateVersion?: number;
  correlationId: string;
  payload?: Record<string, unknown>;
}

export interface DirectCommunicationResult {
  communicationId: string;
  deliveryId: string;
  status: 'QUEUED';
}

/**
 * DirectCommunicationUseCase
 *
 * Sends a single notification directly to a specific recipient + channel
 * without any business event, significance evaluation, or policy check.
 * The caller has full control over channel, recipient, and template.
 */
@Injectable()
export class DirectCommunicationUseCase {
  constructor(
    @Inject(COMMUNICATION_REPOSITORY)
    private readonly commRepo: CommunicationRepositoryPort,
    @Inject(DELIVERY_REPOSITORY)
    private readonly deliveryRepo: DeliveryRepositoryPort,
    @Inject(QUEUE_PUBLICATION_REPOSITORY)
    private readonly queueRepo: QueuePublicationRepositoryPort,
    @Optional() @Inject(TRANSACTION_CONTEXT)
    private readonly transactionContext?: TransactionContextPort,
  ) {}

  async execute(cmd: DirectCommunicationCommand): Promise<DirectCommunicationResult> {
    const now = new Date();
    const commId = randomUUID();
    const deliveryId = randomUUID();

    const persist = async (scope: Pick<TransactionScope, 'communications' | 'deliveries' | 'queuePublications'>) => {
    await scope.communications.create({
      id: commId,
      tenantId: cmd.tenantId,
      sourceModuleId: cmd.sourceModuleId,
      eventType: 'DIRECT',
      sourceEventId: commId,
      aggregateId: commId,
      aggregateVersion: 1,
      schemaVersion: '1.0',
      correlationId: cmd.correlationId,
      occurredAt: now,
      payload: {
        templateIdentity: cmd.templateIdentity,
        templateVersion: cmd.templateVersion ?? 1,
        ...(cmd.payload ?? {}),
      },
      status: 'QUEUED',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    await scope.deliveries.create({
      id: deliveryId,
      communicationId: commId,
      tenantId: cmd.tenantId,
      channel: cmd.channel,
      recipient: cmd.recipient,
      provider: defaultProviderFor(cmd.channel),
      status: 'QUEUED',
      attemptCount: 0,
      version: 1,
      scheduledAt: null,
      sentAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const stableKey = `direct:${commId}:${cmd.channel}:${cmd.recipient}`;
    await scope.queuePublications.create({
      id: randomUUID(),
      tenantId: cmd.tenantId,
      aggregateType: 'delivery',
      aggregateId: deliveryId,
      workType: 'DELIVERY_EXECUTION',
      stableJobKey: stableKey,
      payloadReference: null,
      status: 'PENDING',
      attemptCount: 0,
      availableAt: now,
      lastAttemptAt: null,
      acceptedAt: null,
      failureCode: null,
      failureReason: null,
      correlationId: cmd.correlationId,
      createdAt: now,
      updatedAt: now,
    });
    };
    if (this.transactionContext) {
      await this.transactionContext.run((tx) => persist(tx));
    } else {
      await persist({ communications: this.commRepo, deliveries: this.deliveryRepo, queuePublications: this.queueRepo });
    }

    return { communicationId: commId, deliveryId, status: 'QUEUED' };
  }
}
