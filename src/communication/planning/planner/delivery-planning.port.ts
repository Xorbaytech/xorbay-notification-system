export const DELIVERY_PLANNING = Symbol('DELIVERY_PLANNING');

export interface DeliveryPlanningContext {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  sourceEventId: string;
  correlationId: string;
  policyDecision: unknown;
  recipients: readonly unknown[];
  finalizedContent: unknown;
  scheduleConstraints?: unknown;
  priorityConstraints?: unknown;
  retryConstraints?: unknown;
}

export interface DeliveryPlanningResult {
  durablePlanCandidate: unknown;
  evidence?: readonly unknown[];
}

export interface DeliveryPlanningPort {
  plan(context: DeliveryPlanningContext): Promise<DeliveryPlanningResult>;
}
