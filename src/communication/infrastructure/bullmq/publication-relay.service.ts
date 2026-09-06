import { Inject, Injectable } from '@nestjs/common';
import {
  QueuePublicationRecord,
  QueuePublicationRepositoryPort,
  QUEUE_PUBLICATION_REPOSITORY,
} from '../../persistence/ports/queue-publication-repository.port';
import { DeliveryQueuePort } from '../../common/interfaces/delivery-queue.port';
import { QueueCommand } from '../../common/types/queue-command';
import { QueueBatchSubmissionError } from './bullmq-delivery-queue.adapter';

export const DELIVERY_QUEUE_PORT = Symbol('DELIVERY_QUEUE_PORT');
export const QUEUE_COMMAND_SCHEMA_VERSION = '1.0';

export type PublicationRelayResult =
  | { status: 'IDLE' }
  | {
      status: 'ACCEPTED';
      publicationId: string;
      jobId?: string;
      acceptedCount?: number;
      claimedCount?: number;
    }
  | {
      status: 'RECOVERY_REQUIRED';
      publicationId: string;
      acceptedCount?: number;
      recoveryCount?: number;
      claimedCount?: number;
    };

@Injectable()
export class PublicationRelayService {
  constructor(
    @Inject(QUEUE_PUBLICATION_REPOSITORY)
    private readonly publications: QueuePublicationRepositoryPort,
    @Inject(DELIVERY_QUEUE_PORT)
    private readonly queue: DeliveryQueuePort,
  ) {}

  async runOnce(now: Date = new Date()): Promise<PublicationRelayResult> {
    const publication = await this.publications.claimNext(now);

    if (!publication) {
      return { status: 'IDLE' };
    }

    return this.relayClaimed([publication], now);
  }

  /**
   * Relays a bounded batch of durable publications. The optional repository
   * and queue batch ports keep this service compatible with older adapters.
   */
  async runBatch(
    batchSize: number = this.readBatchSize(),
    now: Date = new Date(),
  ): Promise<PublicationRelayResult> {
    const safeBatchSize = Math.max(1, Math.min(Math.floor(batchSize), 1000));
    const publications = this.publications.claimNextBatch
      ? await this.publications.claimNextBatch(now, safeBatchSize)
      : await this.claimWithLegacyPort(now, safeBatchSize);

    if (publications.length === 0) {
      return { status: 'IDLE' };
    }

    return this.relayClaimed(publications, now);
  }

  private async relayClaimed(
    publications: QueuePublicationRecord[],
    now: Date,
  ): Promise<PublicationRelayResult> {
    if (publications.length === 1 || !this.queue.submitMany) {
      return this.relayIndividually(publications, now);
    }

    const commands = publications.map((publication) => this.toCommand(publication));

    try {
      await this.queue.submitMany(commands);
      await this.markAccepted(publications.map(({ id }) => id), now);
      return {
        status: 'ACCEPTED',
        publicationId: publications[0].id,
        acceptedCount: publications.length,
        claimedCount: publications.length,
      };
    } catch (error) {
      return this.reconcileBatchFailure(publications, error, now);
    }
  }

  private async relayIndividually(
    publications: QueuePublicationRecord[],
    now: Date,
  ): Promise<PublicationRelayResult> {
    if (publications.length === 1) {
      // Preserve the established runOnce contract exactly for callers and
      // existing adapters that do not expose the batch port.
      return this.relaySingleClaimed(publications[0], now);
    }

    let acceptedCount = 0;
    let recoveryCount = 0;
    let firstRecoveryId = publications[0].id;

    for (const publication of publications) {
      const result = await this.relaySingleClaimed(publication, now);
      if (result.status === 'ACCEPTED') acceptedCount += 1;
      if (result.status === 'RECOVERY_REQUIRED') {
        recoveryCount += 1;
        firstRecoveryId = firstRecoveryId ?? result.publicationId;
      }
    }

    if (recoveryCount > 0) {
      return {
        status: 'RECOVERY_REQUIRED',
        publicationId: firstRecoveryId,
        acceptedCount,
        recoveryCount,
        claimedCount: publications.length,
      };
    }

    return {
      status: 'ACCEPTED',
      publicationId: publications[0].id,
      acceptedCount,
      claimedCount: publications.length,
    };
  }

  private async relaySingleClaimed(
    publication: QueuePublicationRecord,
    now: Date,
  ): Promise<PublicationRelayResult> {
    const command = this.toCommand(publication);

    try {
      const alreadyAccepted = await this.queue.exists(command.stableJobKey);

      if (alreadyAccepted) {
        const accepted = await this.publications.markAccepted(publication.id, now);
        return { status: 'ACCEPTED', publicationId: accepted.id };
      }

      const acceptance = await this.queue.submit(command);
      const accepted = await this.publications.markAccepted(publication.id, now);

      return {
        status: 'ACCEPTED',
        publicationId: accepted.id,
        jobId: acceptance.jobId,
      };
    } catch (error) {
      return this.reconcileBatchFailure([publication], error, now);
    }
  }

  private async reconcileBatchFailure(
    publications: QueuePublicationRecord[],
    error: unknown,
    now: Date,
  ): Promise<PublicationRelayResult> {
    const acceptedKeys = new Set(
      error instanceof QueueBatchSubmissionError
        ? error.accepted.map((acceptance) => acceptance.jobId)
        : [],
    );
    const accepted: QueuePublicationRecord[] = [];
    const unresolved: QueuePublicationRecord[] = [];

    for (const publication of publications) {
      // A successful lane is known from the adapter even if the job has
      // already completed and been removed from Redis.
      if (acceptedKeys.has(publication.stableJobKey.replace(/:/g, '-'))) {
        accepted.push(publication);
        continue;
      }

      try {
        if (await this.queue.exists(publication.stableJobKey)) {
          accepted.push(publication);
          continue;
        }
      } catch {
        // Keep the row durable and retryable if Redis cannot be reconciled.
      }
      unresolved.push(publication);
    }

    await this.markAccepted(accepted.map(({ id }) => id), now);

    const reason = error instanceof Error ? error.message : 'Queue publication failed';
    const recoveryAt = new Date(now.getTime() + 60_000);
    await Promise.all(
      unresolved.map((publication) =>
        this.publications.markRecoveryRequired(
          publication.id,
          'QUEUE_PUBLICATION_FAILED',
          reason,
          recoveryAt,
        ),
      ),
    );

    if (unresolved.length === 0) {
      if (publications.length === 1) {
        return { status: 'ACCEPTED', publicationId: publications[0].id };
      }
      return {
        status: 'ACCEPTED',
        publicationId: publications[0].id,
        acceptedCount: accepted.length,
        claimedCount: publications.length,
      };
    }

    if (publications.length === 1) {
      return { status: 'RECOVERY_REQUIRED', publicationId: unresolved[0].id };
    }

    return {
      status: 'RECOVERY_REQUIRED',
      publicationId: unresolved[0].id,
      acceptedCount: accepted.length,
      recoveryCount: unresolved.length,
      claimedCount: publications.length,
    };
  }

  private async markAccepted(ids: string[], now: Date): Promise<void> {
    if (ids.length === 0) return;
    if (this.publications.markAcceptedMany) {
      await this.publications.markAcceptedMany(ids, now);
      return;
    }
    await Promise.all(ids.map((id) => this.publications.markAccepted(id, now)));
  }

  private async claimWithLegacyPort(now: Date, limit: number): Promise<QueuePublicationRecord[]> {
    const publications: QueuePublicationRecord[] = [];
    while (publications.length < limit) {
      const next = await this.publications.claimNext(now);
      if (!next) break;
      publications.push(next);
    }
    return publications;
  }

  private toCommand(publication: QueuePublicationRecord): QueueCommand {
    return {
      stableJobKey: publication.stableJobKey,
      workType: publication.workType,
      logicalWorkId: publication.aggregateId,
      tenantId: publication.tenantId,
      correlationId: publication.correlationId,
      schemaVersion: QUEUE_COMMAND_SCHEMA_VERSION,
      priority: publication.priority ?? 5,
    };
  }

  private readBatchSize(): number {
    const configured = Number(process.env.OUTBOX_RELAY_BATCH_SIZE ?? 500);
    return Number.isFinite(configured) ? Math.max(1, Math.min(Math.floor(configured), 1000)) : 500;
  }
}
