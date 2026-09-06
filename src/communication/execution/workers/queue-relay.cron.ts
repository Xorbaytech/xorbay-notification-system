import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QueuePublicationRepositoryPort,
  QUEUE_PUBLICATION_REPOSITORY,
} from '../../persistence/ports/queue-publication-repository.port';
import {
  DELIVERY_QUEUE_NAME,
  CRITICAL_DELIVERY_QUEUE_NAME,
  BULK_DELIVERY_QUEUE_NAME,
} from '../../infrastructure/bullmq/bullmq-delivery-queue.adapter';

@Injectable()
export class QueueRelayCron {
  private readonly logger = new Logger(QueueRelayCron.name);

  constructor(
    @Inject(QUEUE_PUBLICATION_REPOSITORY) private readonly queuePublicationRepo: QueuePublicationRepositoryPort,
    @InjectQueue(DELIVERY_QUEUE_NAME) private readonly deliveryQueue: Queue,
    @InjectQueue(CRITICAL_DELIVERY_QUEUE_NAME) private readonly criticalQueue: Queue,
    @InjectQueue(BULK_DELIVERY_QUEUE_NAME) private readonly bulkQueue: Queue,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async handleCron() {
    let processed = 0;
    const batchSize = 10;

    while (processed < batchSize) {
      const now = new Date();
      const record = await this.queuePublicationRepo.claimNext(now);

      if (!record) {
        // No more pending records
        break;
      }

      try {
        const deliveryQueue = queueForPriority(record.priority, {
          normal: this.deliveryQueue,
          critical: this.criticalQueue,
          bulk: this.bulkQueue,
        });
        await deliveryQueue.add(
          'execute-delivery',
          {
            logicalWorkId: record.aggregateId, // In this case, aggregateId is deliveryId
            tenantId: record.tenantId,
            workType: record.workType,
            correlationId: record.correlationId,
          },
          {
            jobId: record.stableJobKey.replace(/:/g, '-'),
            removeOnComplete: true,
            removeOnFail: false,
          },
        );

        await this.queuePublicationRepo.markAccepted(record.id, new Date());
        this.logger.debug(`Relayed queue publication ${record.id} to BullMQ.`);
      } catch (error: any) {
        this.logger.error(`Failed to relay queue publication ${record.id} to BullMQ`, error.stack);
        // Next attempt will happen if marked pending, but claimNext leaves it as SUBMITTING.
        // For MVP, we will mark it RECOVERY_REQUIRED.
        await this.queuePublicationRepo.markRecoveryRequired(
          record.id,
          'BULLMQ_ENQUEUE_FAILED',
          error.message,
          new Date(Date.now() + 60000), // try again in 1 minute
        );
      }
      processed++;
    }
  }
}

function queueForPriority(
  priority: number | null | undefined,
  queues: { normal: Queue; critical: Queue; bulk: Queue },
): Queue {
  const value = Number(priority ?? 5);
  if (value <= 2) return queues.critical;
  if (value >= 8) return queues.bulk;
  return queues.normal;
}
