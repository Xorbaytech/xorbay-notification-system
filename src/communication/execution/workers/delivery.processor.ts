import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ExecuteDeliveryJobUseCase } from './execute-delivery-job.use-case';
import { Logger } from '@nestjs/common';
import { QueueCommand } from '../../common/types/queue-command';

@Processor('delivery-queue')
export class DeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryProcessor.name);

  constructor(private readonly executeDelivery: ExecuteDeliveryJobUseCase) {
    super();
  }

  async process(job: Job<QueueCommand, any, string>): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
    try {
      await this.executeDelivery.execute(job.data);
      this.logger.debug(`Successfully processed job ${job.id}`);
    } catch (error: any) {
      this.logger.error(`Error processing job ${job.id}`, error.stack);
      throw error;
    }
  }
}
