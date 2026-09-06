import { QueueCommand } from '../types/queue-command';

export const DELIVERY_EXECUTION_CONTEXT = Symbol('DELIVERY_EXECUTION_CONTEXT');

export interface DeliveryExecutionContext {
  readonly tenantId: string;
  readonly communicationId: string;
  readonly deliveryId: string;
  readonly channel: string;
  readonly recipient: string;
  readonly provider: string;
  /** Queue priority propagated to the provider egress gate. */
  readonly priority?: number;
  readonly attemptNumber: number;
  readonly correlationId: string;
  readonly payload: any;
  readonly eventType: string;
  readonly content?: string;
  /** Rendered subject when the resolved template defines one (EMAIL mostly). */
  readonly subject?: string;
  /** Publisher module that raised the communication — template resolution scope. */
  readonly sourceModuleId?: string;
  readonly version: number;
  readonly executable: boolean;
}

export interface DeliveryExecutionContextPort {
  resolve(command: QueueCommand): Promise<DeliveryExecutionContext | null>;
}
