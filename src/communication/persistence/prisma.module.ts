import { Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaCommunicationRepository } from './repositories/prisma-communication.repository';
import { PrismaDeliveryRepository } from './repositories/prisma-delivery.repository';
import { PrismaAttemptRepository } from './repositories/prisma-attempt.repository';
import { PrismaProcessedEventRepository } from './repositories/prisma-processed-event.repository';
import { PrismaQueuePublicationRepository } from './repositories/prisma-queue-publication.repository';
import { PrismaDeadLetterRepository } from './repositories/prisma-dead-letter.repository';
import { PrismaTransactionContext } from './prisma-transaction-context';
import { TRANSACTION_CONTEXT } from './ports/transaction-context.port';
import { QUEUE_PUBLICATION_REPOSITORY } from './ports/queue-publication-repository.port';
import { DELIVERY_REPOSITORY } from './ports/delivery-repository.port';
import { ATTEMPT_REPOSITORY } from './ports/attempt-repository.port';
import { COMMUNICATION_REPOSITORY } from './ports/communication-repository.port';
import { DEAD_LETTER_REPOSITORY } from './ports/dead-letter-repository.port';
import { SCHEDULED_PLAN_REPOSITORY } from './ports/scheduled-plan-repository.port';
import { SCHEDULED_OCCURRENCE_REPOSITORY } from './ports/scheduled-occurrence-repository.port';
import { PrismaScheduledPlanRepository } from './repositories/prisma-scheduled-plan.repository';
import { PrismaScheduledOccurrenceRepository } from './repositories/prisma-scheduled-occurrence.repository';
import { PrismaCampaignRepository } from './repositories/prisma-campaign.repository';
import { PrismaBroadcastBatchRepository } from './repositories/prisma-broadcast-batch.repository';
import { CAMPAIGN_REPOSITORY } from './ports/campaign-repository.port';
import { BROADCAST_BATCH_REPOSITORY } from './ports/broadcast-batch-repository.port';

const prismaClientProvider = {
  provide: 'PRISMA_CLIENT',
  useFactory: () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is required to initialize Prisma.');
    }
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({ adapter });
  },
};

const transactionContextProvider = {
  provide: TRANSACTION_CONTEXT,
  useExisting: PrismaTransactionContext,
};

const queuePublicationRepositoryProvider = {
  provide: QUEUE_PUBLICATION_REPOSITORY,
  useExisting: PrismaQueuePublicationRepository,
};

const deliveryRepositoryProvider = {
  provide: DELIVERY_REPOSITORY,
  useExisting: PrismaDeliveryRepository,
};

const attemptRepositoryProvider = {
  provide: ATTEMPT_REPOSITORY,
  useExisting: PrismaAttemptRepository,
};

const deadLetterRepositoryProvider = {
  provide: DEAD_LETTER_REPOSITORY,
  useExisting: PrismaDeadLetterRepository,
};

const communicationRepositoryProvider = {
  provide: COMMUNICATION_REPOSITORY,
  useExisting: PrismaCommunicationRepository,
};

const scheduledPlanRepositoryProvider = {
  provide: SCHEDULED_PLAN_REPOSITORY,
  useExisting: PrismaScheduledPlanRepository,
};

const scheduledOccurrenceRepositoryProvider = {
  provide: SCHEDULED_OCCURRENCE_REPOSITORY,
  useExisting: PrismaScheduledOccurrenceRepository,
};

const campaignRepositoryProvider = {
  provide: CAMPAIGN_REPOSITORY,
  useExisting: PrismaCampaignRepository,
};

const broadcastBatchRepositoryProvider = {
  provide: BROADCAST_BATCH_REPOSITORY,
  useExisting: PrismaBroadcastBatchRepository,
};

@Module({
  providers: [
    prismaClientProvider,
    PrismaCommunicationRepository,
    PrismaDeliveryRepository,
    PrismaAttemptRepository,
    PrismaProcessedEventRepository,
    PrismaQueuePublicationRepository,
    PrismaDeadLetterRepository,
    PrismaTransactionContext,
    transactionContextProvider,
    queuePublicationRepositoryProvider,
    deliveryRepositoryProvider,
    attemptRepositoryProvider,
    deadLetterRepositoryProvider,
    communicationRepositoryProvider,
    scheduledPlanRepositoryProvider,
    scheduledOccurrenceRepositoryProvider,
    PrismaScheduledPlanRepository,
    PrismaScheduledOccurrenceRepository,
    PrismaCampaignRepository,
    PrismaBroadcastBatchRepository,
    campaignRepositoryProvider,
    broadcastBatchRepositoryProvider,
  ],
  exports: [
    'PRISMA_CLIENT',
    PrismaCommunicationRepository,
    PrismaDeliveryRepository,
    PrismaAttemptRepository,
    PrismaQueuePublicationRepository,
    PrismaTransactionContext,
    TRANSACTION_CONTEXT,
    QUEUE_PUBLICATION_REPOSITORY,
    DELIVERY_REPOSITORY,
    ATTEMPT_REPOSITORY,
    DEAD_LETTER_REPOSITORY,
    COMMUNICATION_REPOSITORY,
    SCHEDULED_PLAN_REPOSITORY,
    SCHEDULED_OCCURRENCE_REPOSITORY,
    PrismaScheduledPlanRepository,
    PrismaScheduledOccurrenceRepository,
    CAMPAIGN_REPOSITORY,
    BROADCAST_BATCH_REPOSITORY,
  ],
})
export class PrismaModule {}
