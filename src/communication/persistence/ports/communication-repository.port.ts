export type CommunicationStatus = 'QUEUED' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export type CommunicationPayload = Record<string, unknown>;

export interface CommunicationRecord {
  id: string;
  tenantId: string;
  campaignId?: string | null;
  sourceModuleId: string;
  eventType: string;
  sourceEventId: string;
  aggregateId: string;
  aggregateVersion: number;
  schemaVersion: string;
  correlationId: string;
  occurredAt: Date;
  payload: CommunicationPayload;
  status: CommunicationStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunicationRepositoryPort {
  create(data: CommunicationRecord): Promise<CommunicationRecord>;
  findById(id: string, tenantId: string): Promise<CommunicationRecord | null>;
  /** Active rows whose aggregate status may need reconciliation. */
  findActive?(limit: number): Promise<CommunicationRecord[]>;
  /** Recompute and persist status from authoritative delivery rows. */
  refreshStatus?(id: string, tenantId: string, now?: Date): Promise<CommunicationRecord | null>;
}

export const COMMUNICATION_REPOSITORY = Symbol('COMMUNICATION_REPOSITORY');
