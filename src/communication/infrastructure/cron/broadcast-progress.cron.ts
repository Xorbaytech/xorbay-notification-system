import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BROADCAST_BATCH_REPOSITORY, BroadcastBatchRepositoryPort } from '../../persistence/ports/broadcast-batch-repository.port';

/**
 * Reconciles campaign/batch aggregates from authoritative delivery state.
 * Delivery workers remain responsible only for individual execution; this
 * small projector keeps bulk progress eventually consistent after retries,
 * callbacks and process restarts without coupling workers to campaign logic.
 */
@Injectable()
export class BroadcastProgressCron {
  private readonly logger = new Logger(BroadcastProgressCron.name);
  private running = false;

  constructor(
    @Inject(BROADCAST_BATCH_REPOSITORY)
    private readonly batches: BroadcastBatchRepositoryPort,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async handleCron(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const configuredLimit = Number(process.env.BROADCAST_PROGRESS_BATCH_LIMIT ?? 100);
      const limit = Number.isFinite(configuredLimit)
        ? Math.max(1, Math.min(Math.floor(configuredLimit), 1000))
        : 100;
      const active = await this.batches.findActive(limit);
      for (const batch of active) {
        await this.batches.refreshProgress(batch.id, batch.tenantId);
      }
    } catch (error) {
      this.logger.error('Failed to reconcile broadcast progress', error instanceof Error ? error.stack : error);
    } finally {
      this.running = false;
    }
  }
}
