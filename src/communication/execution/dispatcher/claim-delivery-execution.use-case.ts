import { randomUUID } from 'node:crypto';
import { DeliveryExecutionContext } from '../../common/interfaces/delivery-execution-context.port';
import { TransactionContextPort } from '../../persistence/ports/transaction-context.port';

export interface ClaimedDeliveryExecution extends DeliveryExecutionContext {
  readonly attemptId: string;
}

export class ClaimDeliveryExecutionUseCase {
  constructor(private readonly transactionContext: TransactionContextPort) {}

  async execute(context: DeliveryExecutionContext): Promise<ClaimedDeliveryExecution | null> {
    if (!context.executable) {
      return null;
    }

    return this.transactionContext.run(async ({ deliveries, attempts }) => {
      const now = new Date();
      const claimed = await deliveries.claimForExecution(
        context.deliveryId,
        context.tenantId,
        context.version,
        now,
      );

      if (!claimed) {
        return null;
      }

      const attemptId = randomUUID();
      await attempts.create({
        id: attemptId,
        deliveryId: claimed.id,
        tenantId: claimed.tenantId,
        attemptNumber: claimed.attemptCount,
        provider: context.provider,
        providerRef: null,
        status: 'PROCESSING',
        responseCode: null,
        errorMessage: null,
        sentAt: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      return {
        ...context,
        attemptNumber: claimed.attemptCount,
        version: claimed.version,
        attemptId,
      };
    });
  }
}
