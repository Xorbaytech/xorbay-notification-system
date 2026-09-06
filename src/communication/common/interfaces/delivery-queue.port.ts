import { QueueAcceptance, QueueCommand } from '../types/queue-command';

export interface DeliveryQueuePort {
  submit(command: QueueCommand): Promise<QueueAcceptance>;
  /**
   * Atomically submits a bounded set of commands per transport queue. This is
   * optional so custom adapters can continue to use the single-command path.
   */
  submitMany?(commands: QueueCommand[]): Promise<QueueAcceptance[]>;
  exists(stableJobKey: string): Promise<boolean>;
}

export type QueuePort = DeliveryQueuePort;
