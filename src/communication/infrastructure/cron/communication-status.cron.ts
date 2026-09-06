import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { COMMUNICATION_REPOSITORY, CommunicationRepositoryPort } from '../../persistence/ports/communication-repository.port';

/**
 * Durable projector for communication aggregate status.
 *
 * Workers update individual delivery/attempt rows. This projector reconciles
 * the parent communication independently, so a worker race or process restart
 * cannot leave a terminal fan-out permanently displayed as QUEUED.
 */
@Injectable()
export class CommunicationStatusCron {
  private readonly logger = new Logger(CommunicationStatusCron.name);
  private running = false;

  constructor(
    @Inject(COMMUNICATION_REPOSITORY)
    private readonly communications: CommunicationRepositoryPort,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async handleCron(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const configuredLimit = Number(process.env.COMMUNICATION_STATUS_BATCH_LIMIT ?? 250);
      const limit = Number.isFinite(configuredLimit)
        ? Math.max(1, Math.min(Math.floor(configuredLimit), 1000))
        : 250;
      const active = this.communications.findActive ? await this.communications.findActive(limit) : [];
      for (const communication of active) {
        await this.communications.refreshStatus?.(communication.id, communication.tenantId);
      }
    } catch (error) {
      this.logger.error(
        'Failed to reconcile communication status',
        error instanceof Error ? error.stack : error,
      );
    } finally {
      this.running = false;
    }
  }
}
