import { PrismaSignificanceAdapter } from './prisma-significance.adapter';

describe('PrismaSignificanceAdapter', () => {
  let adapter: PrismaSignificanceAdapter;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      significanceRule: {
        findFirst: jest.fn(),
      },
    };
    adapter = new PrismaSignificanceAdapter(prismaMock);
  });

  it('should return NOTIFY if no rule matches', async () => {
    prismaMock.significanceRule.findFirst.mockResolvedValue(null);
    const result = await adapter.evaluate({ tenantId: 'tenant-1', eventType: 'event-1', sourceModuleId: 'm-1', payload: {} } as any);
    expect(result.decision).toBe('NOTIFY');
  });

  it('should return the decision from the matched rule', async () => {
    prismaMock.significanceRule.findFirst.mockResolvedValue({ decision: 'IGNORE' });
    const result = await adapter.evaluate({ tenantId: 'tenant-1', eventType: 'event-1', sourceModuleId: 'm-1', payload: {} } as any);
    expect(result.decision).toBe('IGNORE');
  });
});
