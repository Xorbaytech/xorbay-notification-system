export interface QueuePublicationRecord {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  batchId?: string | null;
  workType: string;
  priority?: number;
  stableJobKey: string;
  payloadReference?: string | null;
  status: string;
  attemptCount: number;
  availableAt: Date;
  lastAttemptAt?: Date | null;
  acceptedAt?: Date | null;
  failureCode?: string | null;
  failureReason?: string | null;
  correlationId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueuePublicationRepositoryPort {
  create(data: QueuePublicationRecord): Promise<QueuePublicationRecord>;
  findByStableJobKey(tenantId: string, stableJobKey: string): Promise<QueuePublicationRecord | null>;
  /** Returns the latest publication for an aggregate when the adapter supports it. */
  findLatestByAggregateId?(tenantId: string, aggregateId: string): Promise<QueuePublicationRecord | null>;
  claimNext(now: Date): Promise<QueuePublicationRecord | null>;
  /**
   * Atomically claims a bounded set of publications for relay. Implementations
   * may omit this method and the relay will fall back to claimNext().
   */
  claimNextBatch?(now: Date, limit: number): Promise<QueuePublicationRecord[]>;
  markAccepted(id: string, acceptedAt: Date): Promise<QueuePublicationRecord>;
  /** Mark a claimed batch accepted in one database round-trip when supported. */
  markAcceptedMany?(ids: string[], acceptedAt: Date): Promise<void>;
  markRecoveryRequired(id: string, failureCode: string, failureReason: string, availableAt: Date): Promise<QueuePublicationRecord>;
  /**
   * Returns durable publications that still need relay or controlled recovery.
   * Optional for backwards-compatible in-memory/test implementations.
   */
  countPending?(): Promise<number>;
}

export const QUEUE_PUBLICATION_REPOSITORY = Symbol('QUEUE_PUBLICATION_REPOSITORY');
