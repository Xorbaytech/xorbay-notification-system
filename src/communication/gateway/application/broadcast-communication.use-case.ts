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
import {
  TRANSACTION_CONTEXT,
  TransactionContextPort,
  TransactionScope,
} from '../../persistence/ports/transaction-context.port';
import {
  BROADCAST_BATCH_REPOSITORY,
  BroadcastBatchRepositoryPort,
} from '../../persistence/ports/broadcast-batch-repository.port';
import {
  CAMPAIGN_REPOSITORY,
  CampaignRepositoryPort,
} from '../../persistence/ports/campaign-repository.port';
import {
  defaultProviderFor,
  recipientAddressFor,
} from '../../common/types/channel-provider.routing';

export interface BroadcastRecipient {
  recipientId: string;
  profile?: Record<string, unknown>;
}

export interface BroadcastCommunicationCommand {
  tenantId: string;
  sourceModuleId: string;
  templateIdentity: string;
  templateVersion?: number;
  correlationId: string;
  recipients: BroadcastRecipient[];
  channel?: string;
  payload?: Record<string, unknown>;
  /** Optional caller-supplied idempotency key for safe request retries. */
  idempotencyKey?: string;
}

export interface BroadcastResult {
  communicationId: string;
  deliveryCount: number;
  status: 'QUEUED';
  campaignId?: string;
  batchCount?: number;
}

/**
 * BroadcastCommunicationUseCase
 *
 * Sends one notification to multiple recipients without requiring a
 * business event. Creates a Communication record and one Delivery per
 * recipient, then queues each delivery for dispatch.
 */
@Injectable()
export class BroadcastCommunicationUseCase {
  constructor(
    @Inject(COMMUNICATION_REPOSITORY)
    private readonly commRepo: CommunicationRepositoryPort,
    @Inject(DELIVERY_REPOSITORY)
    private readonly deliveryRepo: DeliveryRepositoryPort,
    @Inject(QUEUE_PUBLICATION_REPOSITORY)
    private readonly queueRepo: QueuePublicationRepositoryPort,
    @Optional() @Inject(TRANSACTION_CONTEXT)
    private readonly transactionContext?: TransactionContextPort,
    @Optional() @Inject(CAMPAIGN_REPOSITORY)
    private readonly campaignRepo?: CampaignRepositoryPort,
    @Optional() @Inject(BROADCAST_BATCH_REPOSITORY)
    private readonly batchRepo?: BroadcastBatchRepositoryPort,
  ) {}

  async execute(cmd: BroadcastCommunicationCommand): Promise<BroadcastResult> {
    const now = new Date();
    const commId = randomUUID();
    const channel = (cmd.channel ?? 'EMAIL').trim().toUpperCase();
    // A caller can resolve the same person more than once (for example, by
    // selecting a role and then adding the same email manually).  Collapse
    // those entries before creating durable rows.  This is important for both
    // user experience and idempotency: every unique transport address must
    // produce exactly one delivery/publication per broadcast.
    const recipients = dedupeRecipients(cmd.recipients, channel);
    if (recipients.length === 0) {
      throw new Error('Broadcast requires at least one recipient.');
    }
    const batchSize = readBoundedInt('BROADCAST_BATCH_SIZE', 500, 1, 2000);
    const maxRecipients = readBoundedInt('BROADCAST_MAX_RECIPIENTS', 10000, 1, 100000);
    if (recipients.length > maxRecipients) {
      throw new Error(`Broadcast recipient limit exceeded (${maxRecipients})`);
    }
    const totalBatches = Math.max(1, Math.ceil(recipients.length / batchSize));
    const campaignId = randomUUID();
    const idempotencyKey = cmd.idempotencyKey;

    if (this.campaignRepo && idempotencyKey) {
      const existing = await this.campaignRepo.findByIdempotencyKey(cmd.tenantId, idempotencyKey);
      if (existing?.communicationId) {
        return {
          communicationId: existing.communicationId,
          deliveryCount: existing.totalRecipients,
          status: 'QUEUED',
          campaignId: existing.id,
          batchCount: existing.totalBatches,
        };
      }
    }

    // Keep recipient-specific context alongside the communication. Delivery
    // rows intentionally remain transport-focused; the dispatcher selects the
    // matching context by the final channel address before rendering.
    const recipientContexts = Object.fromEntries(
      recipients.map((recipient) => {
        const address = recipientAddressFor(channel, recipient.recipientId, recipient.profile);
        return [address, { ...(recipient.profile ?? {}), recipientId: recipient.recipientId }];
      }),
    );
    const communicationPayload = {
      templateIdentity: cmd.templateIdentity,
      templateVersion: cmd.templateVersion ?? 1,
      ...(cmd.payload ?? {}),
      __recipientContexts: recipientContexts,
    };

    let campaignGroupingEnabled = false;
    const persist = async (
      scope: Pick<
        TransactionScope,
        'communications' | 'deliveries' | 'queuePublications'
      > &
        Partial<Pick<TransactionScope, 'campaigns' | 'broadcastBatches'>>,
    ) => {
      const campaigns = scope.campaigns;
      const batches = scope.broadcastBatches;
      // Grouping is enabled only inside the real transaction scope. Legacy
      // test doubles and fallback repositories retain the original behavior.
      const useCampaignGrouping = Boolean(campaigns && batches);
      campaignGroupingEnabled = useCampaignGrouping;

      if (useCampaignGrouping) {
        await campaigns!.create({
          id: campaignId,
          tenantId: cmd.tenantId,
          sourceModuleId: cmd.sourceModuleId,
          correlationId: cmd.correlationId,
          communicationId: commId,
          idempotencyKey,
          templateIdentity: cmd.templateIdentity,
          templateVersion: cmd.templateVersion ?? 1,
          channel,
          payload: communicationPayload,
          status: 'QUEUED',
          totalRecipients: recipients.length,
          totalBatches,
          completedBatches: 0,
          failedBatches: 0,
          createdAt: now,
          updatedAt: now,
          startedAt: null,
          completedAt: null,
        });
      }

      await scope.communications.create({
        id: commId,
        tenantId: cmd.tenantId,
        campaignId: useCampaignGrouping ? campaignId : null,
        sourceModuleId: cmd.sourceModuleId,
        eventType: 'BROADCAST',
        sourceEventId: commId,
        aggregateId: commId,
        aggregateVersion: 1,
        schemaVersion: '1.0',
        correlationId: cmd.correlationId,
        occurredAt: now,
        payload: communicationPayload,
        status: 'QUEUED',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      // Persist recipients in bounded chunks. This keeps fan-out work predictable
      // and gives operators a single setting to tune for their database capacity.
      for (let offset = 0; offset < recipients.length; offset += batchSize) {
        const batch = recipients.slice(offset, offset + batchSize);
        const batchNumber = Math.floor(offset / batchSize) + 1;
        const batchId = useCampaignGrouping ? randomUUID() : undefined;
        if (useCampaignGrouping) {
          await batches!.create({
            id: batchId!,
            campaignId,
            tenantId: cmd.tenantId,
            batchNumber,
            status: 'QUEUED',
            recipientCount: batch.length,
            queuedCount: batch.length,
            acceptedCount: 0,
            deliveredCount: 0,
            failedCount: 0,
            idempotencyKey: `${idempotencyKey ?? campaignId}:batch:${batchNumber}`,
            queueAcceptedAt: null,
            startedAt: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
          });
        }

        for (const recipient of batch) {
          const deliveryId = randomUUID();
          const recipientAddress = recipientAddressFor(
            channel,
            recipient.recipientId,
            recipient.profile,
          );

          await scope.deliveries.create({
            id: deliveryId,
            communicationId: commId,
            batchId: batchId ?? null,
            tenantId: cmd.tenantId,
            channel,
            recipient: recipientAddress,
            provider: defaultProviderFor(channel),
            status: 'QUEUED',
            attemptCount: 0,
            version: 1,
            scheduledAt: null,
            sentAt: null,
            createdAt: now,
            updatedAt: now,
          });

          const stableKey = `broadcast:${commId}:${recipient.recipientId}:${channel}`;
          await scope.queuePublications.create({
            id: randomUUID(),
            tenantId: cmd.tenantId,
            aggregateType: 'delivery',
            aggregateId: deliveryId,
            batchId: batchId ?? null,
            workType: 'DELIVERY_EXECUTION',
            stableJobKey: stableKey,
            payloadReference: null,
            status: 'PENDING',
            attemptCount: 0,
            availableAt: now,
            // Broadcast fan-out is isolated to the throttled bulk lane.
            priority: 8,
            lastAttemptAt: null,
            acceptedAt: null,
            failureCode: null,
            failureReason: null,
            correlationId: cmd.correlationId,
            createdAt: now,
            updatedAt: now,
          });
        }

        // Yield between batches so the event loop can process health and control requests.
        await Promise.resolve();
      }
    };
    if (this.transactionContext) {
      await this.transactionContext.run((tx) => persist(tx));
    } else {
      await persist({ communications: this.commRepo, deliveries: this.deliveryRepo, queuePublications: this.queueRepo });
    }

    return {
      communicationId: commId,
      deliveryCount: recipients.length,
      status: 'QUEUED',
      ...(campaignGroupingEnabled ? { campaignId, batchCount: totalBatches } : {}),
    };
  }
}

/**
 * Deduplicate by the address that the selected channel will actually use.
 * This also catches the case where two different ERP IDs resolve to one
 * email/phone number. The first profile wins, keeping personalization stable.
 */
function dedupeRecipients(
  recipients: readonly BroadcastRecipient[],
  channel: string,
): BroadcastRecipient[] {
  const seen = new Set<string>();
  const unique: BroadcastRecipient[] = [];

  for (const recipient of recipients) {
    const address = recipientAddressFor(channel, recipient.recipientId, recipient.profile)
      .trim()
      .toLowerCase();
    const identity = address || String(recipient.recipientId).trim().toLowerCase();
    if (seen.has(identity)) continue;
    seen.add(identity);
    unique.push(recipient);
  }

  return unique;
}

function readBoundedInt(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(min, Math.min(Math.floor(value), max)) : fallback;
}
