import { FakeRecipientResolver } from './fake-recipient.resolver';

describe('FakeRecipientResolver', () => {
  const resolver = new FakeRecipientResolver([
    {
      tenantId: 'tenant-fixture',
      sourceModuleId: 'attendance-fixture',
      recipients: [
        { recipientId: 'recipient-001', address: 'student-001@example.test' },
        { recipientId: 'recipient-002', address: 'guardian-001@example.test' },
      ],
    },
  ]);

  it('returns the tenant/module-scoped fixture', async () => {
    const result = await resolver.resolve({
      tenantId: 'tenant-fixture',
      sourceModuleId: 'attendance-fixture',
      eventType: 'AttendanceMarked',
      sourceEventId: 'evt-001',
      correlationId: 'corr-001',
      event: { attendanceId: 'att-001' },
      policyDecision: { decision: 'NOTIFY' },
    });

    expect(result.recipients).toHaveLength(2);
    expect(result.evidence).toEqual([
      expect.objectContaining({
        outcome: 'FIXTURE_MATCHED',
        tenantId: 'tenant-fixture',
        sourceModuleId: 'attendance-fixture',
        recipientCount: 2,
      }),
    ]);
  });

  it('does not leak a fixture across tenant or module scope', async () => {
    const result = await resolver.resolve({
      tenantId: 'other-tenant',
      sourceModuleId: 'attendance-fixture',
      eventType: 'AttendanceMarked',
      sourceEventId: 'evt-002',
      correlationId: 'corr-002',
      event: {},
      policyDecision: { decision: 'NOTIFY' },
    });

    expect(result.recipients).toEqual([]);
    expect(result.evidence).toEqual([
      expect.objectContaining({
        outcome: 'NO_FIXTURE',
        tenantId: 'other-tenant',
        sourceModuleId: 'attendance-fixture',
      }),
    ]);
  });
});
