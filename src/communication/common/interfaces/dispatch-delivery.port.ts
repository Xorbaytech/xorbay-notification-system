import { QueueCommand } from '../types/queue-command';

export const DISPATCH_DELIVERY = Symbol('DISPATCH_DELIVERY');

export interface DispatchDeliveryPort {
  dispatch(command: QueueCommand): Promise<void>;
}
