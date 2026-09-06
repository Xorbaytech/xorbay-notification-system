import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  RecipientResolutionContext,
  RecipientResolutionPort,
  RecipientResolutionResult,
} from '../ports/recipient-resolution.port';

/**
 * Prisma-backed implementation of RecipientResolutionPort.
 *
 * Fetches all recipients registered under the given (tenantId, sourceModuleId)
 * from the `recipients` table. The `profile` JSON field holds contact details
 * such as email, phone, or push tokens.
 */
@Injectable()
export class PrismaRecipientResolver implements RecipientResolutionPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async resolve(
    context: RecipientResolutionContext,
  ): Promise<RecipientResolutionResult> {
    const records = await this.prisma.recipient.findMany({
      where: {
        tenantId: context.tenantId,
        sourceModuleId: context.sourceModuleId,
      },
    });

    if (records.length === 0) {
      return {
        recipients: [],
        evidence: [
          {
            source: 'prisma-recipient-resolver',
            outcome: 'NO_RECIPIENTS',
            tenantId: context.tenantId,
            sourceModuleId: context.sourceModuleId,
          },
        ],
      };
    }

    const recipients = records.map((r) => ({
      recipientId: r.recipientId,
      profile: r.profile,
    }));

    return {
      recipients,
      evidence: [
        {
          source: 'prisma-recipient-resolver',
          outcome: 'RECIPIENTS_FOUND',
          tenantId: context.tenantId,
          sourceModuleId: context.sourceModuleId,
          recipientCount: recipients.length,
        },
      ],
    };
  }
}
