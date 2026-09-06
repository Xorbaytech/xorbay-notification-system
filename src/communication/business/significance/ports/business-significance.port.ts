export const BUSINESS_SIGNIFICANCE = Symbol('BUSINESS_SIGNIFICANCE');

export type BusinessSignificanceDecision = 'NOTIFY' | 'IGNORE' | 'AUDIT_ONLY';

export interface BusinessSignificanceContext {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  sourceEventId: string;
  aggregateId: string;
  aggregateVersion: number;
  schemaVersion: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

export interface BusinessSignificanceResult {
  decision: BusinessSignificanceDecision;
  reason: string;
}

export interface BusinessSignificancePort {
  evaluate(context: BusinessSignificanceContext): Promise<BusinessSignificanceResult>;
}
