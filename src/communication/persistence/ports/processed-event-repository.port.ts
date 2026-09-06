export const PROCESSED_EVENT_REPOSITORY = Symbol('PROCESSED_EVENT_REPOSITORY');

export type ProcessedEventPayload = Record<string, unknown>;

export interface ProcessedEventRecord {
  id: string;
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  sourceEventId: string;
  aggregateId: string;
  aggregateVersion: number;
  schemaVersion: string;
  correlationId: string;
  priorityHint?: 'CRITICAL' | 'NORMAL' | 'BULK';
  payload: ProcessedEventPayload;
  status: string;
  /** Number of resolver/orchestration attempts already made. Optional for
   * backwards-compatible callers that create an initial ACCEPTED record. */
  attemptCount?: number;
  nextAttemptAt?: Date | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProcessedEventRepositoryPort {
  create(data: ProcessedEventRecord): Promise<ProcessedEventRecord>;
  findBySourceEventId(tenantId: string, sourceModuleId: string, eventType: string, aggregateId: string, aggregateVersion: number, sourceEventId: string): Promise<ProcessedEventRecord | null>;
  claimNext(limit: number): Promise<ProcessedEventRecord[]>;
  markProcessed(id: string): Promise<void>;
  recoverStaleProcessing?(olderThan: Date): Promise<number>;
  recoverProcessing?(id: string, failure?: { code?: string | null; message?: string | null; retryAfterMs?: number }): Promise<void>;
}
