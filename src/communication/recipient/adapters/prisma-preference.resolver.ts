import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  PreferenceResolutionContext,
  PreferenceResolutionPort,
  PreferenceResolutionResult,
} from '../ports/preference-resolution.port';

/**
 * Prisma-backed implementation of PreferenceResolutionPort.
 *
 * Looks up per-recipient channel preferences from the `preferences` table.
 * Only recipients whose IDs appear in the context are queried.
 * Any recipient with no row is silently skipped (no preference = not explicitly
 * opted-in, no delivery planned by the policy layer downstream).
 */
@Injectable()
export class PrismaPreferenceResolver implements PreferenceResolutionPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async resolve(
    context: PreferenceResolutionContext,
  ): Promise<PreferenceResolutionResult> {
    const recipientIds = this.extractRecipientIds(context.recipients);

    if (recipientIds.length === 0) {
      return {
        preferences: [],
        evidence: [
          {
            source: 'prisma-preference-resolver',
            outcome: 'NO_RECIPIENTS_IN_CONTEXT',
            tenantId: context.tenantId,
          },
        ],
      };
    }

    const records = await this.prisma.preference.findMany({
      where: {
        tenantId: context.tenantId,
        sourceModuleId: context.sourceModuleId,
        recipientId: { in: recipientIds },
      },
    });

    const preferences = records.map((r) => ({
      recipientId: r.recipientId,
      channel: r.channel,
      decision: r.decision,
    }));

    const evidence = [
      {
        source: 'prisma-preference-resolver',
        outcome: records.length > 0 ? 'PREFERENCES_FOUND' : 'NO_PREFERENCES',
        tenantId: context.tenantId,
        sourceModuleId: context.sourceModuleId,
        queriedRecipientCount: recipientIds.length,
        matchedPreferenceCount: records.length,
      },
    ];

    return { preferences, evidence };
  }

  private extractRecipientIds(recipients: readonly unknown[]): string[] {
    return recipients.flatMap((r) => {
      if (
        typeof r === 'object' &&
        r !== null &&
        'recipientId' in r &&
        typeof (r as Record<string, unknown>).recipientId === 'string'
      ) {
        return [(r as Record<string, unknown>).recipientId as string];
      }
      return [];
    });
  }
}
