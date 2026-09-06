import { Inject, Injectable } from '@nestjs/common';
import { DeliveryExecutionContext, DeliveryExecutionContextPort } from '../common/interfaces/delivery-execution-context.port';
import { QueueCommand } from '../common/types/queue-command';
import { AttemptRepositoryPort, ATTEMPT_REPOSITORY } from './ports/attempt-repository.port';
import { DeliveryRepositoryPort, DELIVERY_REPOSITORY } from './ports/delivery-repository.port';
import { CommunicationRepositoryPort, COMMUNICATION_REPOSITORY } from './ports/communication-repository.port';

@Injectable()
export class PrismaDeliveryExecutionContext implements DeliveryExecutionContextPort {
  constructor(
    @Inject(DELIVERY_REPOSITORY) private readonly deliveries: DeliveryRepositoryPort,
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: AttemptRepositoryPort,
    @Inject(COMMUNICATION_REPOSITORY) private readonly communications: CommunicationRepositoryPort,
  ) {}

  async resolve(command: QueueCommand): Promise<DeliveryExecutionContext | null> {
    const delivery = await this.deliveries.findById(command.logicalWorkId, command.tenantId);

    if (!delivery) {
      return null;
    }

    const executable =
      delivery.status === 'PLANNED' ||
      delivery.status === 'QUEUED' ||
      delivery.status === 'RETRYING';
    if (!executable) {
      return null;
    }

    const communication = await this.communications.findById(delivery.communicationId, command.tenantId);
    if (!communication) {
      return null;
    }

    const latestAttempt = await this.attempts.getLatestByDeliveryId(delivery.id, command.tenantId);

    return {
      tenantId: delivery.tenantId,
      communicationId: delivery.communicationId,
      deliveryId: delivery.id,
      channel: delivery.channel,
      recipient: delivery.recipient,
      provider: delivery.provider ?? '',
      priority: command.priority,
      attemptNumber: (latestAttempt?.attemptNumber ?? 0) + 1,
      correlationId: command.correlationId,
      payload: communication.payload,
      eventType: communication.eventType,
      version: delivery.version,
      executable: true,
      sourceModuleId: communication.sourceModuleId,
    };
  }
}
