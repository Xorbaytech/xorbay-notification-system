import { Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/** Durable, cross-instance idempotency ledger for provider callbacks. */
@Injectable()
export class ProviderCallbackLedgerService {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async recordIfNew(input: {
    tenantId: string; provider: string; providerEventId: string;
    deliveryId: string; attemptId: string; outcome: string;
    payload?: Record<string, unknown>;
  }): Promise<boolean> {
    try {
      await this.prisma.providerCallbackEvent.create({
        data: {
          id: randomUUID(), tenantId: input.tenantId, provider: input.provider,
          providerEventId: input.providerEventId, deliveryId: input.deliveryId,
          attemptId: input.attemptId, outcome: input.outcome,
          payload: input.payload as Prisma.InputJsonValue | undefined,
        },
      });
      return true;
    } catch (error: any) {
      if (error?.code === 'P2002') return false;
      throw error;
    }
  }
}
