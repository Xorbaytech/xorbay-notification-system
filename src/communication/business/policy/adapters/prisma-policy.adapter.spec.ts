import { PrismaPolicyAdapter } from './prisma-policy.adapter';

describe('PrismaPolicyAdapter', () => {
  let adapter: PrismaPolicyAdapter;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      policyRule: {
        findFirst: jest.fn(),
      },
    };
    adapter = new PrismaPolicyAdapter(prismaMock);
  });

  it('should return ALLOWED if no rule matches', async () => {
    prismaMock.policyRule.findFirst.mockResolvedValue(null);
    const result = await adapter.evaluate({ tenantId: 'tenant-1', eventType: 'event-1', sourceModuleId: 'm-1' } as any);
    expect(result.decision).toBe('ALLOWED');
  });

  it('should return the decision from the matched rule', async () => {
    prismaMock.policyRule.findFirst.mockResolvedValue({ decision: 'SUPPRESSED' });
    const result = await adapter.evaluate({ tenantId: 'tenant-1', eventType: 'event-1', sourceModuleId: 'm-1' } as any);
    expect(result.decision).toBe('SUPPRESSED');
  });
});
