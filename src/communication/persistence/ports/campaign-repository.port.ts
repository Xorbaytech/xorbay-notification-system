export type CampaignStatus = 'QUEUED' | 'PROCESSING' | 'PARTIALLY_COMPLETED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface CampaignRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceModuleId: string;
  readonly correlationId: string;
  readonly communicationId?: string | null;
  readonly idempotencyKey?: string | null;
  readonly templateIdentity: string;
  readonly templateVersion: number;
  readonly channel: string;
  readonly payload: Record<string, unknown>;
  readonly status: CampaignStatus;
  readonly totalRecipients: number;
  readonly totalBatches: number;
  readonly completedBatches: number;
  readonly failedBatches: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt?: Date | null;
  readonly completedAt?: Date | null;
}

export interface CampaignRepositoryPort {
  create(data: CampaignRecord): Promise<CampaignRecord>;
  findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<CampaignRecord | null>;
}

export const CAMPAIGN_REPOSITORY = Symbol('CAMPAIGN_REPOSITORY');
