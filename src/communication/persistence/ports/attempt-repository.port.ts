export type AttemptStatus = 'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export interface AttemptRecord {
  id: string;
  deliveryId: string;
  tenantId: string;
  attemptNumber: number;
  provider: string;
  providerRef?: string | null;
  status: AttemptStatus;
  responseCode?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttemptRepositoryPort {
  create(data: AttemptRecord): Promise<AttemptRecord>;
  findById(id: string, tenantId: string): Promise<AttemptRecord | null>;
  findByDeliveryId(deliveryId: string, tenantId: string): Promise<AttemptRecord[]>;
  update(id: string, tenantId: string, data: Partial<AttemptRecord>): Promise<AttemptRecord>;
  /** Atomically updates an attempt while its execution lease is still owned. */
  updateIfProcessingVersion?(
    id: string,
    tenantId: string,
    expectedVersion: number,
    data: Partial<AttemptRecord>,
  ): Promise<AttemptRecord | null>;
  getLatestByDeliveryId(deliveryId: string, tenantId: string): Promise<AttemptRecord | null>;
}

export const ATTEMPT_REPOSITORY = Symbol('ATTEMPT_REPOSITORY');
