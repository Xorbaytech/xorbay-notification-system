export interface DeadLetterRecordDto {
  id: string;
  tenantId: string;
  communicationId: string;
  deliveryId: string;
  channel: string;
  recipient: string;
  failureCode?: string | null;
  failureReason?: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface DeadLetterRepositoryPort {
  create(data: DeadLetterRecordDto): Promise<DeadLetterRecordDto>;
  findByTenantId(tenantId: string): Promise<DeadLetterRecordDto[]>;
  findById(id: string, tenantId: string): Promise<DeadLetterRecordDto | null>;
  delete(id: string, tenantId: string): Promise<void>;
}

export const DEAD_LETTER_REPOSITORY = Symbol('DEAD_LETTER_REPOSITORY');
