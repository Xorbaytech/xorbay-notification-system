import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MetricsService } from '../../observability/metrics.service';
import { QUEUE_PUBLICATION_REPOSITORY, QueuePublicationRepositoryPort } from '../../persistence/ports/queue-publication-repository.port';

@Injectable()
export class OutboxMetricsCron {
  private readonly logger = new Logger(OutboxMetricsCron.name);

  constructor(
    private readonly metrics: MetricsService,
    @Inject(QUEUE_PUBLICATION_REPOSITORY)
    private readonly publications: QueuePublicationRepositoryPort,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron() {
    try {
      // PostgreSQL remains the source of truth for work not yet durably
      // accepted by BullMQ. The optional port method keeps older test doubles
      // and alternate adapters source-compatible while the Prisma adapter
      // reports the real depth in production.
      const countPending = this.publications.countPending;
      if (!countPending) {
        this.logger.debug('Outbox depth metric unavailable for this adapter');
        return;
      }

      const depth = await countPending.call(this.publications);
      this.metrics.setOutboxQueueDepth(depth);
      this.logger.debug(`Outbox queue depth: ${depth}`);
    } catch (error) {
      this.logger.error('Error tracking outbox metrics', error);
    }
  }
}
