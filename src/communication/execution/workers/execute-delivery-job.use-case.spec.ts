import { DispatchDeliveryPort } from '../../common/interfaces/dispatch-delivery.port';
import { QueueCommand } from '../../common/types/queue-command';
import {
  DELIVERY_EXECUTION_WORK_TYPE,
  ExecuteDeliveryJobUseCase,
} from './execute-delivery-job.use-case';

describe('ExecuteDeliveryJobUseCase', () => {
  const command: QueueCommand = {
    stableJobKey: 'tenant-001:delivery-001:1:v1',
    workType: DELIVERY_EXECUTION_WORK_TYPE,
    logicalWorkId: 'delivery-001',
    tenantId: 'tenant-001',
    correlationId: 'corr-001',
    schemaVersion: '1.0',
  };

  it('dispatches a delivery execution job without owning delivery business logic', async () => {
    const dispatchDelivery: jest.Mocked<DispatchDeliveryPort> = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = new ExecuteDeliveryJobUseCase(dispatchDelivery);

    const result = await useCase.execute(command);

    expect(dispatchDelivery.dispatch).toHaveBeenCalledWith(command);
    expect(result).toEqual({
      status: 'DISPATCHED',
      stableJobKey: command.stableJobKey,
      logicalWorkId: command.logicalWorkId,
    });
  });

  it('rejects a queue work type that is not a delivery execution job', async () => {
    const dispatchDelivery: jest.Mocked<DispatchDeliveryPort> = {
      dispatch: jest.fn(),
    };
    const useCase = new ExecuteDeliveryJobUseCase(dispatchDelivery);

    await expect(
      useCase.execute({ ...command, workType: 'UNKNOWN_WORK' }),
    ).rejects.toThrow('Unsupported queue work type: UNKNOWN_WORK');

    expect(dispatchDelivery.dispatch).not.toHaveBeenCalled();
  });

  it('propagates dispatch failure to the queue worker boundary', async () => {
    const dispatchDelivery: jest.Mocked<DispatchDeliveryPort> = {
      dispatch: jest.fn().mockRejectedValue(new Error('dispatch failed')),
    };
    const useCase = new ExecuteDeliveryJobUseCase(dispatchDelivery);

    await expect(useCase.execute(command)).rejects.toThrow('dispatch failed');
  });
});
