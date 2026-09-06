import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  PolicyContext,
  PolicyPort,
  PolicyResult,
} from '../ports/policy.port';

/**
 * DB-backed PolicyPort.
 *
 * Looks up the `policy_rules` table for a rule matching
 * (tenantId, sourceModuleId, eventType). Falls back to ALLOWED with
 * a default template reference when no rule is found.
 *
 * The `templateIdentity` and `templateVersion` fields in the rule are
 * attached to the result so downstream resolvers know which template to use.
 */
@Injectable()
export class PrismaPolicyAdapter implements PolicyPort {
  private readonly logger = new Logger(PrismaPolicyAdapter.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    const rule = await this.prisma.policyRule.findFirst({
      where: {
        tenantId: context.tenantId,
        sourceModuleId: context.sourceModuleId,
        eventType: context.eventType,
        isActive: true,
      },
    });

    if (!rule) {
      this.logger.debug(
        `No policy rule for ${context.tenantId}/${context.sourceModuleId}/${context.eventType} — defaulting to ALLOWED`,
      );
      return {
        decision: 'ALLOWED',
        reason: 'no-rule-default-allowed',
        ...(context.eventType
          ? { templateIdentity: context.eventType, templateVersion: 1 }
          : {}),
      } as PolicyResult & { templateIdentity?: string; templateVersion?: number };
    }

    const decision = rule.decision as PolicyResult['decision'];
    this.logger.debug(`Policy rule matched: ${decision} (rule=${rule.id})`);

    return {
      decision,
      reason: rule.reason ?? `policy-rule:${rule.id}`,
      ...(rule.templateIdentity
        ? {
            templateIdentity: rule.templateIdentity,
            templateVersion: rule.templateVersion ?? 1,
          }
        : {}),
    } as PolicyResult & { templateIdentity?: string; templateVersion?: number };
  }
}
