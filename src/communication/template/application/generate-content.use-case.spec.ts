import { GenerateContentUseCase } from './generate-content.use-case';
import { TemplatePort } from '../ports/template.port';

describe('GenerateContentUseCase', () => {
  it('delegates template selection/rendering to the TemplatePort', async () => {
    const templateResolver: jest.Mocked<TemplatePort> = {
      resolve: jest.fn().mockResolvedValue({
        renderedContent: { subject: 'Attendance update', body: 'Rendered content' },
        context: { templateVersion: '1.0' },
      }),
    };

    const useCase = new GenerateContentUseCase(templateResolver);
    const command = {
      tenantId: 'tenant_001',
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      sourceEventId: 'evt_001',
      correlationId: 'corr_001',
      event: { attendanceStatus: 'ABSENT' },
      policyDecision: { decision: 'ALLOWED' },
      recipients: [{ recipientId: 'student_001' }],
      preferences: [{ recipientId: 'student_001', channel: 'EMAIL' }],
      templateIdentity: 'attendance.absent',
      templateVersion: '1.0',
    };

    await expect(useCase.execute(command)).resolves.toEqual({
      renderedContent: { subject: 'Attendance update', body: 'Rendered content' },
      context: { templateVersion: '1.0' },
    });

    expect(templateResolver.resolve).toHaveBeenCalledWith(command);
  });

  it('propagates template resolution failures without converting them into delivery work', async () => {
    const templateResolver: jest.Mocked<TemplatePort> = {
      resolve: jest.fn().mockRejectedValue(new Error('template resolution failed')),
    };

    const useCase = new GenerateContentUseCase(templateResolver);

    await expect(
      useCase.execute({
        tenantId: 'tenant_001',
        sourceModuleId: 'attendance',
        eventType: 'AttendanceMarked',
        sourceEventId: 'evt_002',
        correlationId: 'corr_002',
        event: {},
        policyDecision: { decision: 'ALLOWED' },
        recipients: [{ recipientId: 'student_001' }],
        preferences: [{ recipientId: 'student_001', channel: 'EMAIL' }],
      }),
    ).rejects.toThrow('template resolution failed');
  });
});
