import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  BusinessSignificanceContext,
  BusinessSignificancePort,
  BusinessSignificanceResult,
} from '../ports/business-significance.port';

/**
 * DB-backed BusinessSignificancePort.
 *
 * Looks up the `significance_rules` table for a rule matching
 * (tenantId, sourceModuleId, eventType). Falls back to NOTIFY when
 * no active rule is found (open-world assumption: notify unless told otherwise).
 */
@Injectable()
export class PrismaSignificanceAdapter implements BusinessSignificancePort {
  private readonly logger = new Logger(PrismaSignificanceAdapter.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async evaluate(
    context: BusinessSignificanceContext,
  ): Promise<BusinessSignificanceResult> {
    const rule = await this.prisma.significanceRule.findFirst({
      where: {
        tenantId: context.tenantId,
        sourceModuleId: context.sourceModuleId,
        eventType: context.eventType,
        isActive: true,
      },
      orderBy: { priority: 'desc' },
    });

    if (!rule) {
      this.logger.debug(
        `No significance rule found for ${context.tenantId}/${context.sourceModuleId}/${context.eventType} — defaulting to NOTIFY`,
      );
      return { decision: 'NOTIFY', reason: 'no-rule-default-notify' };
    }

    const decision = rule.decision as BusinessSignificanceResult['decision'];
    this.logger.debug(
      `Significance rule matched: ${decision} (rule=${rule.id})`,
    );

    return { decision, reason: `significance-rule:${rule.id}` };
  }
}
