import {
  PreferenceResolutionContext,
  PreferenceResolutionPort,
  PreferenceResolutionResult,
} from '../ports/preference-resolution.port';

export type FakePreferenceDecision = 'ALLOW' | 'DENY';

export interface FakePreferenceFixture {
  tenantId: string;
  sourceModuleId: string;
  recipientId: string;
  channel: string;
  decision: FakePreferenceDecision;
}

/**
 * Deterministic MVP preference source.
 *
 * Real preference services remain outside this module boundary. The adapter
 * only resolves seeded tenant/module/recipient/channel fixtures.
 */
export class FakePreferenceResolver implements PreferenceResolutionPort {
  constructor(private readonly fixtures: readonly FakePreferenceFixture[]) {}

  async resolve(
    context: PreferenceResolutionContext,
  ): Promise<PreferenceResolutionResult> {
    const preferences: unknown[] = [];
    const evidence: unknown[] = [];

    for (const recipient of context.recipients) {
      const candidate = this.fixtures.find(
        (fixture) =>
          fixture.tenantId === context.tenantId &&
          fixture.sourceModuleId === context.sourceModuleId &&
          fixture.recipientId === this.recipientIdOf(recipient),
      );

      if (!candidate) {
        evidence.push({
          source: 'fake-preference-resolver',
          outcome: 'NO_FIXTURE',
          tenantId: context.tenantId,
          sourceModuleId: context.sourceModuleId,
          recipientId: this.recipientIdOf(recipient),
        });
        continue;
      }

      preferences.push({
        recipientId: candidate.recipientId,
        channel: candidate.channel,
        decision: candidate.decision,
      });

      evidence.push({
        source: 'fake-preference-resolver',
        outcome: 'FIXTURE_MATCHED',
        tenantId: candidate.tenantId,
        sourceModuleId: candidate.sourceModuleId,
        recipientId: candidate.recipientId,
        channel: candidate.channel,
        decision: candidate.decision,
      });
    }

    return { preferences, evidence };
  }

  private recipientIdOf(recipient: unknown): string {
    if (
      typeof recipient === 'object' &&
      recipient !== null &&
      'recipientId' in recipient &&
      typeof recipient.recipientId === 'string'
    ) {
      return recipient.recipientId;
    }

    return String(recipient);
  }
}
