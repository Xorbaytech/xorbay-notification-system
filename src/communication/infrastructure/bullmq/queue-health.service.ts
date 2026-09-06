import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DELIVERY_QUEUE_NAME, CRITICAL_DELIVERY_QUEUE_NAME, BULK_DELIVERY_QUEUE_NAME } from './bullmq-delivery-queue.adapter';

/** Performs a lightweight Redis/BullMQ readiness probe. */
@Injectable()
export class QueueHealthService {
  constructor(
    @InjectQueue(DELIVERY_QUEUE_NAME) private readonly queue: Queue,
    @InjectQueue(CRITICAL_DELIVERY_QUEUE_NAME) private readonly criticalQueue: Queue,
    @InjectQueue(BULK_DELIVERY_QUEUE_NAME) private readonly bulkQueue: Queue,
  ) {}

  async check(): Promise<{ status: 'CONNECTED' | 'DISCONNECTED'; error?: string }> {
    try {
      await Promise.all([
        this.queue.getJobCounts(),
        this.criticalQueue.getJobCounts(),
        this.bulkQueue.getJobCounts(),
      ]);
      return { status: 'CONNECTED' };
    } catch (error) {
      return {
        status: 'DISCONNECTED',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
