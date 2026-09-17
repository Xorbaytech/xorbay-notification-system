import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { DELIVERY_QUEUE_PORT, PublicationRelayService } from './bullmq/publication-relay.service';
import { BullmqDeliveryQueueAdapter, DELIVERY_QUEUE_NAME, CRITICAL_DELIVERY_QUEUE_NAME, BULK_DELIVERY_QUEUE_NAME } from './bullmq/bullmq-delivery-queue.adapter';
import { OutboxRelayCron } from './cron/outbox-relay.cron';
import { DeliveryWorker, CriticalDeliveryWorker, BulkDeliveryWorker } from './bullmq/delivery.worker';
import { PrismaModule } from '../persistence/prisma.module';
import { ExecutionModule } from '../execution/execution.module';
import { QueueHealthService } from './bullmq/queue-health.service';
import { redisConnectionOptions } from './redis/redis-connection';

@Module({
  imports: [
    PrismaModule,
    ExecutionModule, // Exposes ExecuteDeliveryJobUseCase
    ScheduleModule.forRoot(),
    BullModule.forRoot({
      connection: redisConnectionOptions(),
    }),
    BullModule.registerQueue({
      name: DELIVERY_QUEUE_NAME,
    }),
    BullModule.registerQueue({ name: CRITICAL_DELIVERY_QUEUE_NAME }),
    BullModule.registerQueue({ name: BULK_DELIVERY_QUEUE_NAME }),
  ],
  providers: [
    {
      provide: DELIVERY_QUEUE_PORT,
      useClass: BullmqDeliveryQueueAdapter,
    },
    PublicationRelayService,
    OutboxRelayCron,
    DeliveryWorker,
    CriticalDeliveryWorker,
    BulkDeliveryWorker,
    QueueHealthService,
  ],
  exports: [
    DELIVERY_QUEUE_PORT,
    PublicationRelayService,
    QueueHealthService,
  ],
})
export class QueueModule { }
