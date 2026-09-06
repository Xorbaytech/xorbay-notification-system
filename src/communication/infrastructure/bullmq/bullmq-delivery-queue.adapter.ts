import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DeliveryQueuePort } from '../../common/interfaces/delivery-queue.port';
import { QueueCommand, QueueAcceptance } from '../../common/types/queue-command';

export const DELIVERY_QUEUE_NAME = 'delivery-queue';
export const CRITICAL_DELIVERY_QUEUE_NAME = 'critical-delivery-queue';
export const BULK_DELIVERY_QUEUE_NAME = 'bulk-delivery-queue';

/**
 * Raised when one or more priority queues accepted a bulk submission but a
 * different queue failed. The relay can persist the accepted subset and only
 * recover the ambiguous subset, without replaying successful jobs.
 */
export class QueueBatchSubmissionError extends Error {
  constructor(
    message: string,
    readonly accepted: QueueAcceptance[],
  ) {
    super(message);
    this.name = 'QueueBatchSubmissionError';
  }
}

@Injectable()
export class BullmqDeliveryQueueAdapter implements DeliveryQueuePort {
  private readonly logger = new Logger(BullmqDeliveryQueueAdapter.name);

  constructor(
    @InjectQueue(DELIVERY_QUEUE_NAME) private readonly queue: Queue<QueueCommand>,
    @InjectQueue(CRITICAL_DELIVERY_QUEUE_NAME) private readonly criticalQueue: Queue<QueueCommand>,
    @InjectQueue(BULK_DELIVERY_QUEUE_NAME) private readonly bulkQueue: Queue<QueueCommand>,
  ) {}

  async submit(command: QueueCommand): Promise<QueueAcceptance> {
    // BullMQ rejects ':' in custom job IDs. Keep the durable DB stable key
    // unchanged, but use a transport-safe representation for Redis.
    const queueJobId = command.stableJobKey.replace(/:/g, '-');
    const attempts = this.readPositiveInt('DELIVERY_QUEUE_ATTEMPTS', 3, 1, 20);
    const backoffDelay = this.readPositiveInt('DELIVERY_QUEUE_BACKOFF_MS', 5000, 100, 300000);
    const queue = queueForPriority(command.priority, this.queue, this.criticalQueue, this.bulkQueue);
    const job = await queue.add(command.workType, command, jobOptions(command, attempts, backoffDelay));

    this.logger.debug(`Submitted job ${job.id} for logicalWorkId ${command.logicalWorkId}`);

    return {
      jobId: job.id ?? queueJobId,
    };
  }

  async submitMany(commands: QueueCommand[]): Promise<QueueAcceptance[]> {
    if (commands.length === 0) return [];

    const attempts = this.readPositiveInt('DELIVERY_QUEUE_ATTEMPTS', 3, 1, 20);
    const backoffDelay = this.readPositiveInt('DELIVERY_QUEUE_BACKOFF_MS', 5000, 100, 300000);
    const grouped = groupByQueue(commands, this.queue, this.criticalQueue, this.bulkQueue);

    // Each addBulk call is atomic within its BullMQ queue. Promise.allSettled
    // lets us retain successful priority lanes when another lane is down.
    const outcomes = await Promise.allSettled(
      grouped.map(async ({ queue, commands: lane }) => {
        const jobs = await queue.addBulk(
          lane.map((command) => ({
            name: command.workType,
            data: command,
            opts: jobOptions(command, attempts, backoffDelay),
          })),
        );

        if (jobs.length !== lane.length) {
          throw new Error(`BullMQ returned ${jobs.length} jobs for ${lane.length} commands`);
        }

        return lane.map((command, index) => ({
          jobId: jobs[index].id ?? command.stableJobKey.replace(/:/g, '-'),
        }));
      }),
    );

    const accepted = outcomes
      .filter((outcome): outcome is PromiseFulfilledResult<QueueAcceptance[]> => outcome.status === 'fulfilled')
      .flatMap((outcome) => outcome.value);
    const failures = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');

    if (failures.length > 0) {
      const message = failures
        .map((failure) => (failure.reason instanceof Error ? failure.reason.message : String(failure.reason)))
        .join('; ');
      throw new QueueBatchSubmissionError(`Bulk queue submission failed: ${message}`, accepted);
    }

    this.logger.debug(`Submitted ${accepted.length} jobs to BullMQ in ${grouped.length} bulk operation(s)`);
    return accepted;
  }

  async exists(stableJobKey: string): Promise<boolean> {
    const queueJobId = stableJobKey.replace(/:/g, '-');
    const jobs = await Promise.all([
      this.queue.getJob(queueJobId),
      this.criticalQueue.getJob(queueJobId),
      this.bulkQueue.getJob(queueJobId),
    ]);
    return jobs.some(Boolean);
  }

  private readPositiveInt(name: string, fallback: number, min: number, max: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) ? Math.max(min, Math.min(Math.floor(value), max)) : fallback;
  }
}

function jobOptions(command: QueueCommand, attempts: number, backoffDelay: number) {
  return {
    jobId: command.stableJobKey.replace(/:/g, '-'),
    attempts,
    backoff: {
      type: 'exponential' as const,
      delay: backoffDelay,
    },
    // BullMQ uses lower numbers as higher priority.
    priority: clampPriority(command.priority),
    removeOnComplete: true,
    removeOnFail: false,
  };
}

function groupByQueue(
  commands: QueueCommand[],
  normal: Queue<QueueCommand>,
  critical: Queue<QueueCommand>,
  bulk: Queue<QueueCommand>,
): Array<{ queue: Queue<QueueCommand>; commands: QueueCommand[] }> {
  const groups = new Map<Queue<QueueCommand>, QueueCommand[]>();
  for (const command of commands) {
    const queue = queueForPriority(command.priority, normal, critical, bulk);
    const lane = groups.get(queue) ?? [];
    lane.push(command);
    groups.set(queue, lane);
  }
  return [...groups.entries()].map(([queue, lane]) => ({ queue, commands: lane }));
}

function queueForPriority(
  priority: number | undefined,
  normal: Queue<QueueCommand>,
  critical: Queue<QueueCommand>,
  bulk: Queue<QueueCommand>,
): Queue<QueueCommand> {
  const value = Number(priority ?? 5);
  if (value <= 2) return critical;
  if (value >= 8) return bulk;
  return normal;
}

function clampPriority(priority: number | undefined): number {
  const value = Number(priority);
  return Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), 10)) : 5;
}
