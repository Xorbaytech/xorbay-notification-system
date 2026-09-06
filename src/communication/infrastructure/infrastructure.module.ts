import { Module } from '@nestjs/common';
import { QueueModule } from './queue.module';
import { ObservabilityModule } from '../observability/observability.module';
import { OutboxMetricsCron } from './cron/outbox-metrics.cron';
import { PrismaModule } from '../persistence/prisma.module';
import { BroadcastProgressCron } from './cron/broadcast-progress.cron';
import { CommunicationStatusCron } from './cron/communication-status.cron';

@Module({
  imports: [QueueModule, ObservabilityModule, PrismaModule],
  providers: [OutboxMetricsCron, BroadcastProgressCron, CommunicationStatusCron],
  exports: [QueueModule],
})
export class InfrastructureModule {}
