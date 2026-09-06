import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { TRANSACTION_CONTEXT, TransactionContextPort } from '../../persistence/ports/transaction-context.port';
import { DELIVERY_EXECUTION_WORK_TYPE } from '../dispatcher/dispatch-delivery.use-case';

export interface RequeueDeadLetterCommand {
  tenantId: string;
  deadLetterId: string;
}

@Injectable()
export class RequeueDeadLetterUseCase {
  constructor(
    @Inject(TRANSACTION_CONTEXT)
    private readonly txContext: TransactionContextPort,
    @Inject('PRISMA_CLIENT')
    private readonly prisma: PrismaClient,
  ) {}

  async execute(command: RequeueDeadLetterCommand): Promise<void> {
    const deadLetter = await this.prisma.deadLetterRecord.findUnique({
      where: { id: command.deadLetterId },
    });

    if (!deadLetter || deadLetter.tenantId !== command.tenantId) {
      throw new NotFoundException(`Dead letter record ${command.deadLetterId} not found`);
    }

    const now = new Date();
    const publicationId = randomUUID();
    const stableJobKey = `${command.tenantId}:requeue:${deadLetter.deliveryId}:${now.getTime()}`;

    await this.txContext.run(async ({ deliveries, queuePublications, deadLetterRecords }) => {
      // 1. Move delivery back to QUEUED
      const delivery = await deliveries.findById(deadLetter.deliveryId, command.tenantId);
      if (!delivery) {
        throw new Error(`Original delivery ${deadLetter.deliveryId} not found for requeue`);
      }

      await deliveries.update(deadLetter.deliveryId, command.tenantId, {
        status: 'QUEUED',
        version: delivery.version + 1,
      });

      // 2. Republish to queue
      await queuePublications.create({
        id: publicationId,
        tenantId: command.tenantId,
        aggregateType: 'DELIVERY',
        aggregateId: deadLetter.deliveryId,
        workType: DELIVERY_EXECUTION_WORK_TYPE,
        stableJobKey,
        status: 'PENDING',
        attemptCount: 0,
        availableAt: now,
        correlationId: `requeue-${deadLetter.id}`,
        createdAt: now,
        updatedAt: now,
      });

      // 3. Delete from DLQ
      await deadLetterRecords.delete(command.deadLetterId, command.tenantId);
    });
  }
}
