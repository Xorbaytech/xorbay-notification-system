import { Inject, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import {
  DeliveryRepositoryPort,
  DELIVERY_REPOSITORY,
} from '../../persistence/ports/delivery-repository.port';

/**
 * API-03 — Cancel Communication Use Case.
 *
 * Architecture rules (SPEC-009 + LLD-05 §9 + LLD-03 §11):
 * - Cancellable states: PLANNED, QUEUED (delivery is not yet executing).
 * - PROCESSING is NOT cancellable (execution is in flight); return 409 CONFLICT.
 * - DELIVERED/FAILED/CANCELLED are terminal states; cannot be re-cancelled.
 * - Cancellation applies to all non-terminal deliveries for a communicationId.
 * - Version predicate ensures concurrent requests are safe.
 * - Cancellation is authoritative in PostgreSQL; BullMQ does NOT govern the decision.
 */

export interface CancelCommunicationCommand {
  readonly communicationId: string;
  readonly tenantId: string;
  readonly correlationId: string;
}

export interface CancelCommunicationResult {
  readonly cancelledDeliveries: string[];
  readonly skippedDeliveries: string[];
  readonly conflicts: string[];
}

const CANCELLABLE_STATES = new Set(['PLANNED', 'QUEUED', 'RETRYING', 'SCHEDULED']);
const TERMINAL_STATES = new Set(['DELIVERED', 'FAILED', 'CANCELLED', 'EXPIRED']);

@Injectable()
export class CancelCommunicationUseCase {
  constructor(
    @Inject(DELIVERY_REPOSITORY)
    private readonly deliveries: DeliveryRepositoryPort,
  ) {}

  async execute(command: CancelCommunicationCommand): Promise<CancelCommunicationResult> {
    const allDeliveries = await this.deliveries.findByCommunicationId(
      command.communicationId,
      command.tenantId,
    );

    if (allDeliveries.length === 0) {
      throw new NotFoundException({
        error: {
          code: 'COMMUNICATION_NOT_FOUND',
          message: `Communication ${command.communicationId} not found.`,
        },
        correlationId: command.correlationId,
      });
    }

    const cancelled: string[] = [];
    const skipped: string[] = [];
    const conflicts: string[] = [];

    for (const delivery of allDeliveries) {
      if (TERMINAL_STATES.has(delivery.status)) {
        // Already in a terminal state — nothing to do
        skipped.push(delivery.id);
        continue;
      }

      if (delivery.status === 'PROCESSING') {
        // In-flight execution — cannot be cancelled via API
        conflicts.push(delivery.id);
        continue;
      }

      if (CANCELLABLE_STATES.has(delivery.status)) {
        await this.deliveries.update(delivery.id, command.tenantId, {
          status: 'CANCELLED',
          version: delivery.version + 1,
        });
        cancelled.push(delivery.id);
      } else {
        // Unknown/unexpected state
        skipped.push(delivery.id);
      }
    }

    if (conflicts.length > 0 && cancelled.length === 0) {
      // All non-terminal deliveries are in PROCESSING — return 409
      throw new ConflictException({
        error: {
          code: 'DELIVERY_PROCESSING_CONFLICT',
          message: 'One or more deliveries are currently being processed and cannot be cancelled.',
        },
        correlationId: command.correlationId,
        conflictingDeliveryIds: conflicts,
      });
    }

    return { cancelledDeliveries: cancelled, skippedDeliveries: skipped, conflicts };
  }
}
