import {
  UpsertSignificanceRuleUseCase,
  UpsertPolicyRuleUseCase,
} from './rules.use-cases';

describe('Rules Use Cases', () => {
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      significanceRule: {
        upsert: jest.fn(),
      },
      policyRule: {
        upsert: jest.fn(),
      },
    };
  });

  describe('UpsertSignificanceRuleUseCase', () => {
    it('creates a rule', async () => {
      prismaMock.significanceRule.upsert.mockResolvedValue({ id: '1' });
      const useCase = new UpsertSignificanceRuleUseCase(prismaMock);
      const result = await useCase.execute({
        tenantId: 't-1',
        sourceModuleId: 'm-1',
        eventType: 'e-1',
        decision: 'NOTIFY',
        priority: 1,
      });
      expect(result.id).toBe('1');
    });
  });

  describe('UpsertPolicyRuleUseCase', () => {
    it('creates a rule', async () => {
      prismaMock.policyRule.upsert.mockResolvedValue({ id: '1' });
      const useCase = new UpsertPolicyRuleUseCase(prismaMock);
      const result = await useCase.execute({
        tenantId: 't-1',
        sourceModuleId: 'm-1',
        eventType: 'e-1',
        decision: 'ALLOWED',
      });
      expect(result.id).toBe('1');
    });
  });
});
