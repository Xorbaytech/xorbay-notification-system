import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TransactionContextPort, TransactionScope } from './ports/transaction-context.port';
import { PrismaCommunicationRepository } from './repositories/prisma-communication.repository';
import { PrismaDeliveryRepository } from './repositories/prisma-delivery.repository';
import { PrismaAttemptRepository } from './repositories/prisma-attempt.repository';
import { PrismaTransactionProcessedEventRepository } from './repositories/prisma-transaction-processed-event.repository';
import { PrismaQueuePublicationRepository } from './repositories/prisma-queue-publication.repository';
import { PrismaDeadLetterRepository } from './repositories/prisma-dead-letter.repository';
import { PrismaCampaignRepository } from './repositories/prisma-campaign.repository';
import { PrismaBroadcastBatchRepository } from './repositories/prisma-broadcast-batch.repository';

@Injectable()
export class PrismaTransactionContext implements TransactionContextPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async run<T>(work: (tx: TransactionScope) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (client: Prisma.TransactionClient) => {
      const transactionClient = client as unknown as PrismaClient;
      const scope: TransactionScope = {
        communications: new PrismaCommunicationRepository(transactionClient),
        deliveries: new PrismaDeliveryRepository(transactionClient),
        attempts: new PrismaAttemptRepository(transactionClient),
        processedEvents: new PrismaTransactionProcessedEventRepository(client),
        queuePublications: new PrismaQueuePublicationRepository(transactionClient),
        deadLetterRecords: new PrismaDeadLetterRepository(transactionClient),
        campaigns: new PrismaCampaignRepository(transactionClient),
        broadcastBatches: new PrismaBroadcastBatchRepository(transactionClient),
      };

      return work(scope);
    }, {
      maxWait: transactionSetting('PRISMA_TX_MAX_WAIT_MS', 10000, 1000, 60000),
      timeout: transactionSetting('PRISMA_TX_TIMEOUT_MS', 30000, 5000, 120000),
    });
  }
}

function transactionSetting(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(min, Math.min(Math.floor(value), max)) : fallback;
}
