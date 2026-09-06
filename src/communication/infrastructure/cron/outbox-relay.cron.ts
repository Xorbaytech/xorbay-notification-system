import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PublicationRelayService } from '../bullmq/publication-relay.service';

@Injectable()
export class OutboxRelayCron {
  private readonly logger = new Logger(OutboxRelayCron.name);
  private isRunning = false;

  constructor(private readonly relayService: PublicationRelayService) {}

  @Cron(CronExpression.EVERY_SECOND)
  async handleCron() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    try {
      // Bound one tick so a continuously busy outbox cannot monopolize the
      // process. Remaining work is picked up on the next tick. A batch is
      // still bounded separately so Redis/DB memory stays predictable.
      const configuredLimit = Number(process.env.OUTBOX_RELAY_MAX_PER_TICK ?? 500);
      const maxPerTick = Number.isFinite(configuredLimit)
        ? Math.max(1, Math.min(Math.floor(configuredLimit), 5000))
        : 500;
      const configuredBatchSize = Number(process.env.OUTBOX_RELAY_BATCH_SIZE ?? 500);
      const batchSize = Number.isFinite(configuredBatchSize)
        ? Math.max(1, Math.min(Math.floor(configuredBatchSize), 1000))
        : 500;
      let processed = 0;
      while (processed < maxPerTick) {
        const result = await this.relayService.runBatch(Math.min(batchSize, maxPerTick - processed));
        
        if (result.status === 'IDLE') {
          break; // Queue is empty, exit loop
        }
        
        if (result.status === 'ACCEPTED') {
          const claimed = result.claimedCount ?? 1;
          this.logger.debug(
            `Relayed ${result.acceptedCount ?? 1}/${claimed} publication(s) to BullMQ`,
          );
          processed += claimed;
        }

        if (result.status === 'RECOVERY_REQUIRED') {
          const claimed = result.claimedCount ?? 1;
          this.logger.warn(
            `Relayed ${result.acceptedCount ?? 0}/${claimed} publication(s); ` +
              `${result.recoveryCount ?? 1} requires recovery`,
          );
          processed += claimed;
          break; // Stop draining to prevent log spam, try again next tick
        }
      }
      if (processed >= maxPerTick) {
        this.logger.debug(`Outbox relay reached per-tick limit (${maxPerTick}); continuing next tick.`);
      }
    } catch (error) {
      this.logger.error('Unexpected error in OutboxRelayCron', error instanceof Error ? error.stack : error);
    } finally {
      this.isRunning = false;
    }
  }
}
