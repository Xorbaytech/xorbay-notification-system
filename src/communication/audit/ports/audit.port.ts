export const AUDIT = Symbol('AUDIT');

export interface BusinessSignificanceAuditRecord {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  sourceEventId: string;
  correlationId: string;
  decision: string;
  reason: string;
}

export interface AuditPort {
  recordBusinessSignificance(record: BusinessSignificanceAuditRecord): Promise<void>;
}
