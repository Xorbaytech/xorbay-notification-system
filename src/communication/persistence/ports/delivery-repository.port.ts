export type DeliveryStatus = 'PLANNED' | 'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'RETRYING' | 'CANCELLED';

export interface DeliveryRecord {
  id: string;
  communicationId: string;
  batchId?: string | null;
  tenantId: string;
  channel: string;
  recipient: string;
  provider?: string | null;
  /** Parent delivery when this record is an automatic fallback. */
  fallbackOfDeliveryId?: string | null;
  status: DeliveryStatus;
  attemptCount: number;
  version: number;
  scheduledAt?: Date | null;
  sentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliveryRepositoryPort {
  create(data: DeliveryRecord): Promise<DeliveryRecord>;
  findById(id: string, tenantId: string): Promise<DeliveryRecord | null>;
  findByCommunicationId(communicationId: string, tenantId: string): Promise<DeliveryRecord[]>;
  findByTenantAndStatus(tenantId: string, status: DeliveryStatus): Promise<DeliveryRecord[]>;
  /**
   * Returns a bounded set of deliveries whose execution lease has expired.
   * Optional so non-Prisma adapters remain backwards compatible.
   */
  findStaleProcessing?(olderThan: Date, limit: number): Promise<DeliveryRecord[]>;
  update(id: string, tenantId: string, data: Partial<DeliveryRecord>): Promise<DeliveryRecord>;
  /** Atomically applies an outcome only if this execution still owns the version. */
  updateIfProcessingVersion?(
    id: string,
    tenantId: string,
    expectedVersion: number,
    data: Partial<DeliveryRecord>,
  ): Promise<DeliveryRecord | null>;
  claimForExecution(
    id: string,
    tenantId: string,
    expectedVersion: number,
    now: Date,
  ): Promise<DeliveryRecord | null>;
}

export const DELIVERY_REPOSITORY = Symbol('DELIVERY_REPOSITORY');
