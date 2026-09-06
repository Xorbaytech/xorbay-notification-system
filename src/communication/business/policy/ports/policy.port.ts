export const POLICY = Symbol('POLICY');

export type PolicyDecision =
  | 'ALLOWED'
  | 'SUPPRESSED'
  | 'DELAYED'
  | 'ESCALATED'
  | 'MODIFIED';

export interface PolicyContext {
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

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
  escalationLevel?: 'STANDARD' | 'HIGH' | 'CRITICAL' | 'EMERGENCY';
}

export interface PolicyPort {
  evaluate(context: PolicyContext): Promise<PolicyResult>;
}
