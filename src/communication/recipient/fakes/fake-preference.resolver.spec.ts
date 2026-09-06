import {
  FakePreferenceResolver,
  FakePreferenceFixture,
} from './fake-preference.resolver';
import { PreferenceResolutionContext } from '../ports/preference-resolution.port';

const context = (
  overrides: Partial<PreferenceResolutionContext> = {},
): PreferenceResolutionContext => ({
  tenantId: 'tenant-1',
  sourceModuleId: 'attendance',
  eventType: 'AttendanceMarked',
  sourceEventId: 'evt-1',
  correlationId: 'corr-1',
  recipients: [
    { recipientId: 'recipient-1', address: 'student@example.test' },
    { recipientId: 'recipient-2', address: 'guardian@example.test' },
  ],
  policyDecision: { decision: 'NOTIFY' },
  ...overrides,
});

describe('FakePreferenceResolver', () => {
  const fixtures: readonly FakePreferenceFixture[] = [
    {
      tenantId: 'tenant-1',
      sourceModuleId: 'attendance',
      recipientId: 'recipient-1',
      channel: 'EMAIL',
      decision: 'ALLOW',
    },
    {
      tenantId: 'tenant-1',
      sourceModuleId: 'attendance',
      recipientId: 'recipient-2',
      channel: 'SMS',
      decision: 'DENY',
    },
  ];

  it('returns deterministic seeded allow/deny preferences', async () => {
    const resolver = new FakePreferenceResolver(fixtures);

    const result = await resolver.resolve(context());

    expect(result.preferences).toEqual([
      { recipientId: 'recipient-1', channel: 'EMAIL', decision: 'ALLOW' },
      { recipientId: 'recipient-2', channel: 'SMS', decision: 'DENY' },
    ]);
    expect(result.evidence).toEqual([
      expect.objectContaining({
        source: 'fake-preference-resolver',
        outcome: 'FIXTURE_MATCHED',
        recipientId: 'recipient-1',
        decision: 'ALLOW',
      }),
      expect.objectContaining({
        source: 'fake-preference-resolver',
        outcome: 'FIXTURE_MATCHED',
        recipientId: 'recipient-2',
        decision: 'DENY',
      }),
    ]);
  });

  it('does not cross tenant or source-module boundaries', async () => {
    const resolver = new FakePreferenceResolver(fixtures);

    const result = await resolver.resolve(
      context({ tenantId: 'tenant-2', sourceModuleId: 'attendance' }),
    );

    expect(result.preferences).toEqual([]);
    expect(result.evidence).toEqual([
      expect.objectContaining({ outcome: 'NO_FIXTURE', recipientId: 'recipient-1' }),
      expect.objectContaining({ outcome: 'NO_FIXTURE', recipientId: 'recipient-2' }),
    ]);
  });

  it('returns no preferences and deterministic evidence for an empty recipient set', async () => {
    const resolver = new FakePreferenceResolver(fixtures);

    const result = await resolver.resolve(context({ recipients: [] }));

    expect(result).toEqual({ preferences: [], evidence: [] });
  });
});
