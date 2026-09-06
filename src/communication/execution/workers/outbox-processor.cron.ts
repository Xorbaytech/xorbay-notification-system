import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  PROCESSED_EVENT_REPOSITORY,
  ProcessedEventRepositoryPort,
} from '../../persistence/ports/processed-event-repository.port';
import { ProcessCommunicationUseCase } from '../../business/lifecycle/process-communication.use-case';
import { TRANSACTION_CONTEXT, TransactionContextPort } from '../../persistence/ports/transaction-context.port';
import { defaultProviderFor } from '../../common/types/channel-provider.routing';
import { RecipientResolutionUnavailableError } from '../../recipient/ports/recipient-resolution.port';

const CRITICAL_EVENTS = new Set([
  'AttendanceMarked',
  'FeeInvoiceGenerated',
  'FeePaymentFailed',
  'FeeReminder',
  'FeeOverdue',
  'FeePaymentLinkGenerated',
  'SubscriptionExpiring',
  'TeacherAssigned',
  'TeacherAddedToBatch',
  'TeacherWelcome',
  'StudentAdmissionTeacher',
  'TimetableUpdated',
  'TimetableSlotRemoved',
  'ClassStartingSoon',
]);

function eventPriority(eventType: string, sourceModuleId: string, priorityHint?: string): number {
  if (priorityHint === 'BULK') return 8;
  if (priorityHint === 'NORMAL') return 5;
  if (priorityHint === 'CRITICAL') {
    const allowedModules = (process.env.PUBLISHER_CRITICAL_MODULES ?? 'erp-core')
      .split(',')
      .map((moduleId) => moduleId.trim())
      .filter(Boolean);
    if (allowedModules.includes(sourceModuleId)) return 1;
  }
  return CRITICAL_EVENTS.has(eventType) ? 1 : 5;
}

function retryDelayFor(
  event: { attemptCount?: number },
  error: unknown,
): number {
  const retryAfterMs =
    error instanceof RecipientResolutionUnavailableError ? error.retryAfterMs : undefined;
  const configuredBase = Number(process.env.OUTBOX_RETRY_BASE_MS ?? 5_000);
  const configuredMax = Number(process.env.OUTBOX_RETRY_MAX_MS ?? 5 * 60_000);
  const baseMs = Number.isFinite(configuredBase) && configuredBase > 0 ? configuredBase : 5_000;
  const maxMs = Number.isFinite(configuredMax) && configuredMax >= baseMs ? configuredMax : 5 * 60_000;

  if (retryAfterMs !== undefined && retryAfterMs >= 0) {
    return Math.min(Math.max(1_000, retryAfterMs) + Math.floor(Math.random() * 250), maxMs);
  }

  const attempt = Math.max(0, event.attemptCount ?? 0);
  const exponential = Math.min(baseMs * 2 ** Math.min(attempt, 8), maxMs);
  return Math.min(exponential + Math.floor(Math.random() * 250), maxMs);
}

interface ResolvedPreference {
  recipientId: string;
  channel: string;
  decision: string;
  recipient?: string;
}

@Injectable()
export class OutboxProcessorCron {
  private readonly logger = new Logger(OutboxProcessorCron.name);
  private processing = false;

  constructor(
    @Inject(PROCESSED_EVENT_REPOSITORY)
    private readonly processedEventRepo: ProcessedEventRepositoryPort,
    private readonly processCommunication: ProcessCommunicationUseCase,
    @Inject(TRANSACTION_CONTEXT)
    private readonly transactionContext: TransactionContextPort,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async handleCron() {
    // A cron tick can overlap when recipient resolution or the database is
    // slow.  Prevent a second local drain from claiming another burst while
    // the first drain is still resolving events.  SKIP LOCKED still protects
    // this across multiple application instances.
    if (this.processing) {
      return;
    }
    this.processing = true;

    try {
      await this.processedEventRepo.recoverStaleProcessing?.(new Date(Date.now() - 60_000));
      const batchSize = 10;
      const pendingEvents = await this.processedEventRepo.claimNext(batchSize);

      if (!pendingEvents || pendingEvents.length === 0) {
        return;
      }

      for (const event of pendingEvents) {
        try {
        const result = await this.processCommunication.execute({
          tenantId: event.tenantId,
          sourceModuleId: event.sourceModuleId,
          eventType: event.eventType,
          sourceEventId: event.sourceEventId,
          aggregateId: event.aggregateId,
          aggregateVersion: event.aggregateVersion,
          schemaVersion: event.schemaVersion,
          correlationId: event.correlationId,
          payload: event.payload as Record<string, unknown>,
        });

        const allowed: ResolvedPreference[] = (result.preferences?.preferences ?? [])
          .filter((p: any) => p?.decision === 'ALLOW')
          .map((p: any) => ({
            recipientId: p.recipientId,
            channel: p.channel,
            decision: p.decision,
          }));

        // Critical/mandatory events must never disappear just because a
        // recipient has no preference row yet. IN_APP is the platform's
        // mandatory channel; synthesize that decision from the resolved
        // recipients and keep any explicitly allowed optional channels.
        if (CRITICAL_EVENTS.has(event.eventType)) {
          const inAppRecipients = (result.recipients?.recipients ?? [])
            .map((recipient: any) => recipient?.recipientId)
            .filter((recipientId: unknown): recipientId is string => typeof recipientId === 'string');
          const existingInApp = new Set(
            allowed.filter((preference) => preference.channel === 'IN_APP').map((preference) => preference.recipientId),
          );
          for (const recipientId of inAppRecipients) {
            if (!existingInApp.has(recipientId)) {
              allowed.push({ recipientId, channel: 'IN_APP', decision: 'ALLOW' });
            }
          }
        }

        if (result.significance.decision === 'NOTIFY' && allowed.length > 0) {
          // Find matching recipients to get email addresses
          const profilesMap = new Map<string, any>();
          for (const r of (result.recipients?.recipients ?? []) as any[]) {
            if (r?.recipientId && r?.profile) {
              profilesMap.set(r.recipientId, r.profile);
            }
          }

          await this.transactionContext.run(async (tx) => {
            const communicationId = randomUUID();
            const now = new Date();

            // Attempt to create Communication (idempotent — unique constraint guards duplicate processing)
            let created = true;
            try {
            await tx.communications.create({
              id: communicationId,
              tenantId: event.tenantId,
              sourceModuleId: event.sourceModuleId,
              eventType: event.eventType,
              sourceEventId: event.sourceEventId,
              aggregateId: event.aggregateId,
              aggregateVersion: event.aggregateVersion,
              schemaVersion: event.schemaVersion,
              correlationId: event.correlationId,
              occurredAt: event.createdAt,
              payload: event.payload,
              status: 'QUEUED',
              version: 1,
              createdAt: now,
              updatedAt: now,
            });

            } catch (err: any) {
              // P2002 = unique constraint violation — event already processed before
              if (err?.code === 'P2002') {
                created = false;
                this.logger.warn(`Communication already exists for event ${event.id}, marking as processed.`);
              } else {
                throw err;
              }
            }

            if (created) {
              for (const pref of allowed) {
                const deliveryId = randomUUID();
                let recipientAddress = pref.recipientId;
                const profile = profilesMap.get(pref.recipientId);
                if (profile) {
                  if (pref.channel === 'IN_APP' && profile.userId) {
                    // Recipient resolvers may use a logical address such as
                    // guardian:<studentId>; the ERP notification table is
                    // keyed by the concrete user id.
                    recipientAddress = profile.userId;
                  } else if (pref.channel === 'EMAIL' && profile.email) {
                    recipientAddress = profile.email;
                  } else if ((pref.channel === 'SMS' || pref.channel === 'WHATSAPP') && profile.phone) {
                    recipientAddress = profile.phone;
                  }
                }

                await tx.deliveries.create({
                  id: deliveryId,
                  communicationId,
                  tenantId: event.tenantId,
                  channel: pref.channel,
                  recipient: recipientAddress,
                  // Default provider route per channel (IN_APP/WHATSAPP go through the ERP callback adapters)
                  provider: defaultProviderFor(pref.channel) ?? 'FAKE_PUSH',
                  status: 'QUEUED',
                  attemptCount: 0,
                  version: 1,
                  scheduledAt: null,
                  sentAt: null,
                  createdAt: now,
                  updatedAt: now,
                });

                await tx.queuePublications.create({
                  id: randomUUID(),
                  tenantId: event.tenantId,
                  aggregateType: 'Delivery',
                  aggregateId: deliveryId,
                  workType: 'DELIVERY_EXECUTION',
                  stableJobKey: `${event.tenantId}:${deliveryId}:1`,
                  payloadReference: null,
                  status: 'PENDING',
                  attemptCount: 0,
                  correlationId: event.correlationId,
                  createdAt: now,
                  updatedAt: now,
                  availableAt: now,
                  priority: eventPriority(event.eventType, event.sourceModuleId, event.priorityHint),
                });

                this.logger.log(
                  `Created Delivery ${deliveryId} → ${pref.channel} → ${recipientAddress} for event ${event.id}`,
                );
              }
            }
          });
        }

        await this.processedEventRepo.markProcessed(event.id);
        this.logger.debug(
          `Outbox event ${event.id} processed (significance=${result.significance.decision}, deliveries=${allowed.length})`,
        );
        } catch (error: any) {
          const message = error instanceof Error ? error.message : String(error);
          const status = error instanceof RecipientResolutionUnavailableError ? error.status : undefined;
          const code = status
            ? `ERP_RESOLVER_HTTP_${status}`
            : error instanceof RecipientResolutionUnavailableError
              ? 'ERP_RESOLVER_UNAVAILABLE'
              : 'OUTBOX_PROCESSING_ERROR';
          this.logger.error(`Failed to process outbox event ${event.id}: ${message}`, error?.stack);
          // Requeue with durable exponential backoff.  The event remains
          // ACCEPTED and is eligible only after next_attempt_at, so a resolver
          // outage cannot create a tight retry loop or duplicate deliveries.
          try {
            await this.processedEventRepo.recoverProcessing?.(event.id, {
              code,
              message: message.slice(0, 2_000),
              retryAfterMs: retryDelayFor(event, error),
            });
          } catch (recoveryError: any) {
            this.logger.error(
              `Failed to persist retry state for outbox event ${event.id}: ${recoveryError?.message ?? recoveryError}`,
              recoveryError?.stack,
            );
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
