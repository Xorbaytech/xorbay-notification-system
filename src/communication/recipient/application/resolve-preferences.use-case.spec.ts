import { ResolvePreferencesUseCase } from './resolve-preferences.use-case';
import { PreferenceResolutionPort } from '../ports/preference-resolution.port';

describe('ResolvePreferencesUseCase', () => {
  it('delegates preference resolution without applying policy or channel rules itself', async () => {
    const resolver: PreferenceResolutionPort = {
      resolve: jest.fn().mockResolvedValue({
        preferences: [
          { recipientId: 'recipient_001', channel: 'EMAIL', allowed: true },
        ],
        evidence: [{ source: 'TEST_FIXTURE' }],
      }),
    };

    const useCase = new ResolvePreferencesUseCase(resolver);
    const command = {
      tenantId: 'tenant_001',
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      sourceEventId: 'evt_preference_001',
      correlationId: 'corr_preference_001',
      recipients: [{ recipientId: 'recipient_001' }],
      policyDecision: 'ALLOWED',
    };

    await expect(useCase.execute(command)).resolves.toEqual({
      preferences: [
        { recipientId: 'recipient_001', channel: 'EMAIL', allowed: true },
      ],
      evidence: [{ source: 'TEST_FIXTURE' }],
    });

    expect(resolver.resolve).toHaveBeenCalledWith(command);
  });

  it('preserves an empty preference result for downstream handling', async () => {
    const resolver: PreferenceResolutionPort = {
      resolve: jest.fn().mockResolvedValue({ preferences: [] }),
    };

    const useCase = new ResolvePreferencesUseCase(resolver);

    await expect(
      useCase.execute({
        tenantId: 'tenant_001',
        sourceModuleId: 'attendance',
        eventType: 'AttendanceMarked',
        sourceEventId: 'evt_preference_002',
        correlationId: 'corr_preference_002',
        recipients: [{ recipientId: 'recipient_001' }],
        policyDecision: 'ALLOWED',
      }),
    ).resolves.toEqual({ preferences: [] });
  });
});
