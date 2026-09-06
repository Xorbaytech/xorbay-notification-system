import { AttemptRepositoryPort } from './attempt-repository.port';
import { CommunicationRepositoryPort } from './communication-repository.port';
import { DeliveryRepositoryPort } from './delivery-repository.port';
import { ProcessedEventRecord } from './processed-event-repository.port';
import { QueuePublicationRepositoryPort } from './queue-publication-repository.port';
import { DeadLetterRepositoryPort } from './dead-letter-repository.port';
import { CampaignRepositoryPort } from './campaign-repository.port';
import { BroadcastBatchRepositoryPort } from './broadcast-batch-repository.port';

export interface TransactionalProcessedEventRepositoryPort {
  findByBusinessIdentity(identity: {
    tenantId: string;
    sourceModuleId: string;
    eventType: string;
    aggregateId: string;
    aggregateVersion: number;
    sourceEventId: string;
  }): Promise<ProcessedEventRecord | null>;
  createProcessingRecord(data: ProcessedEventRecord): Promise<{
    record: ProcessedEventRecord;
    created: boolean;
  }>;
}

export interface TransactionScope {
  communications: CommunicationRepositoryPort;
  deliveries: DeliveryRepositoryPort;
  attempts: AttemptRepositoryPort;
  processedEvents: TransactionalProcessedEventRepositoryPort;
  queuePublications: QueuePublicationRepositoryPort;
  deadLetterRecords: DeadLetterRepositoryPort;
  /** Optional for legacy transaction doubles; production Prisma scope provides both. */
  campaigns?: CampaignRepositoryPort;
  broadcastBatches?: BroadcastBatchRepositoryPort;
}

export interface TransactionContextPort {
  run<T>(work: (tx: TransactionScope) => Promise<T>): Promise<T>;
}

export const TRANSACTION_CONTEXT = Symbol('TRANSACTION_CONTEXT');
