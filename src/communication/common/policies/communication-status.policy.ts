import { CommunicationStatus } from '../../persistence/ports/communication-repository.port';
import { DeliveryStatus } from '../../persistence/ports/delivery-repository.port';

/**
 * Computes the observable state of a communication from its child deliveries.
 *
 * Delivery rows are the source of truth for execution. Keeping this policy
 * independent of Prisma and Nest allows both the read API and the durable
 * status projector to use exactly the same lifecycle rules.
 */
export function aggregateCommunicationStatus(
  deliveryStatuses: readonly DeliveryStatus[],
  storedStatus: CommunicationStatus,
): CommunicationStatus {
  if (deliveryStatuses.length === 0) return storedStatus;
  if (storedStatus === 'CANCELLED') return 'CANCELLED';

  const hasInFlight = deliveryStatuses.some((status) =>
    status === 'PLANNED' ||
    status === 'QUEUED' ||
    status === 'PROCESSING' ||
    status === 'RETRYING',
  );
  if (hasInFlight) {
    return storedStatus === 'PROCESSING' ? 'PROCESSING' : 'QUEUED';
  }

  if (deliveryStatuses.every((status) => status === 'CANCELLED')) {
    return 'CANCELLED';
  }
  if (deliveryStatuses.some((status) => status === 'FAILED')) {
    return 'FAILED';
  }
  if (deliveryStatuses.every((status) => status === 'DELIVERED')) {
    return 'DELIVERED';
  }
  if (deliveryStatuses.every((status) => status === 'SENT' || status === 'DELIVERED')) {
    return 'SENT';
  }

  return storedStatus;
}
