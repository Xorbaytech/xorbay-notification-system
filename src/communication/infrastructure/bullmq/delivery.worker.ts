import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { DELIVERY_QUEUE_NAME, CRITICAL_DELIVERY_QUEUE_NAME, BULK_DELIVERY_QUEUE_NAME } from './bullmq-delivery-queue.adapter';
import { QueueCommand } from '../../common/types/queue-command';
import { ExecuteDeliveryJobUseCase } from '../../execution/workers/execute-delivery-job.use-case';

@Processor(DELIVERY_QUEUE_NAME, {
  // Keep the default conservative for local deployments while allowing
  // production operators to scale consumers without changing source code.
  concurrency: readWorkerConcurrency(),
  limiter: readRateLimiter('DELIVERY_WORKER_RATE_LIMIT', 20),
})
@Injectable()
export class DeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(DeliveryWorker.name);

  constructor(protected readonly executeDeliveryJob: ExecuteDeliveryJobUseCase) {
    super();
  }

  async process(job: Job<QueueCommand, any, string>): Promise<any> {
    this.logger.debug(`Processing job ${job.id} for logicalWorkId ${job.data.logicalWorkId}`);
    
    try {
      const result = await this.executeDeliveryJob.execute(job.data);
      this.logger.debug(`Successfully dispatched delivery for logicalWorkId ${job.data.logicalWorkId}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to process job ${job.id}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed with error: ${error.message}`);
  }
}

/** Reserved worker lane for mandatory/high-priority notifications. */
@Processor(CRITICAL_DELIVERY_QUEUE_NAME, {
  concurrency: readConcurrency('CRITICAL_WORKER_CONCURRENCY', 2),
  limiter: readRateLimiter('CRITICAL_WORKER_RATE_LIMIT', 50),
})
@Injectable()
export class CriticalDeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(CriticalDeliveryWorker.name);
  constructor(private readonly executeDeliveryJob: ExecuteDeliveryJobUseCase) { super(); }
  async process(job: Job<QueueCommand, any, string>): Promise<any> {
    this.logger.debug(`Processing critical job ${job.id} for logicalWorkId ${job.data.logicalWorkId}`);
    return this.executeDeliveryJob.execute(job.data);
  }
  @OnWorkerEvent('failed') onFailed(job: Job, error: Error) {
    this.logger.error(`Critical job ${job.id} failed: ${error.message}`);
  }
}

/** Throttled worker lane for bulk broadcasts and campaign fan-out. */
@Processor(BULK_DELIVERY_QUEUE_NAME, {
  concurrency: readConcurrency('BULK_WORKER_CONCURRENCY', 2),
  limiter: readRateLimiter('BULK_WORKER_RATE_LIMIT', 20),
})
@Injectable()
export class BulkDeliveryWorker extends WorkerHost {
  private readonly logger = new Logger(BulkDeliveryWorker.name);
  constructor(private readonly executeDeliveryJob: ExecuteDeliveryJobUseCase) { super(); }
  async process(job: Job<QueueCommand, any, string>): Promise<any> {
    this.logger.debug(`Processing bulk job ${job.id} for logicalWorkId ${job.data.logicalWorkId}`);
    return this.executeDeliveryJob.execute(job.data);
  }
  @OnWorkerEvent('failed') onFailed(job: Job, error: Error) {
    this.logger.error(`Bulk job ${job.id} failed: ${error.message}`);
  }
}

function readWorkerConcurrency(): number {
  return readConcurrency('DELIVERY_WORKER_CONCURRENCY', 1);
}

function readConcurrency(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), 50)) : fallback;
}

/**
 * BullMQ's limiter is Redis-backed and shared by all workers consuming the
 * same queue. Keeping conservative per-lane defaults makes the aggregate
 * callback rate stay below the ERP callback policy while still allowing
 * operators to tune throughput with environment variables.
 */
function readRateLimiter(name: string, fallback: number): { max: number; duration: number } {
  const max = Number(process.env[name]);
  const duration = Number(process.env[`${name}_DURATION_MS`]);
  return {
    max: Number.isFinite(max) && max > 0 ? Math.min(Math.floor(max), 10_000) : fallback,
    duration: Number.isFinite(duration) && duration > 0 ? Math.min(Math.floor(duration), 60_000) : 1_000,
  };
}
