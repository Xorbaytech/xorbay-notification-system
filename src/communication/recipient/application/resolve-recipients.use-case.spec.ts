import { ResolveRecipientsUseCase } from './resolve-recipients.use-case';
import { RecipientResolutionPort } from '../ports/recipient-resolution.port';

describe('ResolveRecipientsUseCase', () => {
  it('delegates recipient resolution to the recipient port', async () => {
    const result = {
      recipients: [{ recipientId: 'recipient-001' }],
      evidence: [{ source: 'test' }],
    };
    const resolver: RecipientResolutionPort = {
      resolve: jest.fn().mockResolvedValue(result),
    };
    const useCase = new ResolveRecipientsUseCase(resolver);

    const command = {
      tenantId: 'tenant-001',
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      sourceEventId: 'evt-recipient-001',
      correlationId: 'corr-recipient-001',
      event: { studentId: 'student-001' },
      policyDecision: { outcome: 'ALLOWED' },
    };

    await expect(useCase.execute(command)).resolves.toEqual(result);
    expect(resolver.resolve).toHaveBeenCalledWith(command);
  });

  it('preserves an empty eligible-recipient result', async () => {
    const resolver: RecipientResolutionPort = {
      resolve: jest.fn().mockResolvedValue({ recipients: [], evidence: [] }),
    };
    const useCase = new ResolveRecipientsUseCase(resolver);

    const command = {
      tenantId: 'tenant-001',
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      sourceEventId: 'evt-recipient-002',
      correlationId: 'corr-recipient-002',
      event: { studentId: 'student-002' },
      policyDecision: { outcome: 'ALLOWED' },
    };

    await expect(useCase.execute(command)).resolves.toEqual({ recipients: [], evidence: [] });
  });
});
