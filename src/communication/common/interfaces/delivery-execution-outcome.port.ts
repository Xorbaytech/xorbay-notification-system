export type DeliveryExecutionOutcomeStatus = 'SENT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export interface DeliveryExecutionOutcome {
  readonly deliveryId: string;
  readonly attemptId: string;
  readonly tenantId: string;
  readonly status: DeliveryExecutionOutcomeStatus;
  readonly providerRef?: string | null;
  readonly responseCode?: string | null;
  readonly errorMessage?: string | null;
  readonly sentAt?: Date | null;
}

export interface DeliveryExecutionOutcomePort {
  record(outcome: DeliveryExecutionOutcome): Promise<void>;
}

export const DELIVERY_EXECUTION_OUTCOME = Symbol('DELIVERY_EXECUTION_OUTCOME');
