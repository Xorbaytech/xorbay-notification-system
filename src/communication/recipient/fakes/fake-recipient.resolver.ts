import {
  RecipientResolutionContext,
  RecipientResolutionPort,
  RecipientResolutionResult,
} from '../ports/recipient-resolution.port';

export interface FakeRecipientFixture {
  tenantId: string;
  sourceModuleId: string;
  recipients: readonly unknown[];
}

/**
 * Deterministic MVP recipient source.
 *
 * The real ERP/User source remains outside this module boundary. This adapter
 * exists only to provide tenant/module-scoped fixtures for local and test use.
 */
export class FakeRecipientResolver implements RecipientResolutionPort {
  constructor(private readonly fixtures: readonly FakeRecipientFixture[]) {}

  async resolve(
    context: RecipientResolutionContext,
  ): Promise<RecipientResolutionResult> {
    const fixture = this.fixtures.find(
      (candidate) =>
        candidate.tenantId === context.tenantId &&
        candidate.sourceModuleId === context.sourceModuleId,
    );

    if (!fixture) {
      return {
        recipients: [],
        evidence: [
          {
            source: 'fake-recipient-resolver',
            outcome: 'NO_FIXTURE',
            tenantId: context.tenantId,
            sourceModuleId: context.sourceModuleId,
          },
        ],
      };
    }

    return {
      recipients: fixture.recipients,
      evidence: [
        {
          source: 'fake-recipient-resolver',
          outcome: 'FIXTURE_MATCHED',
          tenantId: fixture.tenantId,
          sourceModuleId: fixture.sourceModuleId,
          recipientCount: fixture.recipients.length,
        },
      ],
    };
  }
}
