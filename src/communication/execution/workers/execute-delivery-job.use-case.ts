import { DispatchDeliveryPort } from '../../common/interfaces/dispatch-delivery.port';
import { QueueCommand } from '../../common/types/queue-command';

export const DELIVERY_EXECUTION_WORK_TYPE = 'DELIVERY_EXECUTION' as const;

export interface DeliveryJobExecutionResult {
  readonly status: 'DISPATCHED';
  readonly stableJobKey: string;
  readonly logicalWorkId: string;
}

export class ExecuteDeliveryJobUseCase {
  constructor(private readonly dispatchDelivery: DispatchDeliveryPort) {}

  async execute(command: QueueCommand): Promise<DeliveryJobExecutionResult> {
    if (command.workType !== DELIVERY_EXECUTION_WORK_TYPE) {
      throw new Error(`Unsupported queue work type: ${command.workType}`);
    }

    await this.dispatchDelivery.dispatch(command);

    return {
      status: 'DISPATCHED',
      stableJobKey: command.stableJobKey,
      logicalWorkId: command.logicalWorkId,
    };
  }
}
