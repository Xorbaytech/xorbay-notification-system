import { ProcessCommunicationUseCase } from './process-communication.use-case';
import { AuditPort } from '../../audit/ports/audit.port';
import { BusinessSignificanceContext, BusinessSignificancePort } from '../significance/ports/business-significance.port';
import { PolicyPort } from '../policy/ports/policy.port';
import { RecipientResolutionPort } from '../../recipient/ports/recipient-resolution.port';
import { PreferenceResolutionPort } from '../../recipient/ports/preference-resolution.port';
import { TemplatePort } from '../../template/ports/template.port';

describe('ProcessCommunicationUseCase', () => {
  const context: BusinessSignificanceContext = {
    tenantId: 'tenant_001',
    sourceModuleId: 'attendance',
    eventType: 'AttendanceMarked',
    sourceEventId: 'evt_process_001',
    aggregateId: 'student_001',
    aggregateVersion: 1,
    schemaVersion: '1.0',
    correlationId: 'corr_process_001',
    payload: { studentId: 'student_001', attendanceStatus: 'ABSENT' },
  };

  const buildDependencies = (significanceResult: { decision: 'NOTIFY' | 'IGNORE' | 'AUDIT_ONLY'; reason: string }) => {
    const evaluator: BusinessSignificancePort = { evaluate: jest.fn().mockResolvedValue(significanceResult) };
    const audit: AuditPort = { recordBusinessSignificance: jest.fn().mockResolvedValue(undefined) };
    const policy: PolicyPort = { evaluate: jest.fn().mockResolvedValue({ decision: 'ALLOWED', reason: 'Policy allows this communication.' }) };
    const recipientResolution: RecipientResolutionPort = { resolve: jest.fn().mockResolvedValue({ recipients: [{ recipientId: 'student_001' }], evidence: [{ source: 'test-fixture' }] }) };
    const preferenceResolution: PreferenceResolutionPort = { resolve: jest.fn().mockResolvedValue({ preferences: [{ recipientId: 'student_001', channel: 'EMAIL' }], evidence: [{ source: 'test-fixture' }] }) };
    const templateResolution: TemplatePort = { resolve: jest.fn().mockResolvedValue({ renderedContent: { subject: 'Attendance update', body: 'Rendered content' }, context: { source: 'test-fixture' } }) };
    return { evaluator, audit, policy, recipientResolution, preferenceResolution, templateResolution };
  };

  const createUseCase = (dependencies: ReturnType<typeof buildDependencies>) =>
    new ProcessCommunicationUseCase(dependencies.evaluator, dependencies.audit, dependencies.policy, dependencies.recipientResolution, dependencies.preferenceResolution, dependencies.templateResolution);

  it('orchestrates NOTIFY → policy → recipient → preference → content', async () => {
    const dependencies = buildDependencies({ decision: 'NOTIFY', reason: 'Attendance changed to ABSENT.' });
    const useCase = createUseCase(dependencies);
    await expect(useCase.execute(context)).resolves.toEqual({
      significance: { decision: 'NOTIFY', reason: 'Attendance changed to ABSENT.' },
      policy: { decision: 'ALLOWED', reason: 'Policy allows this communication.' },
      recipients: { recipients: [{ recipientId: 'student_001' }], evidence: [{ source: 'test-fixture' }] },
      preferences: { preferences: [{ recipientId: 'student_001', channel: 'EMAIL' }], evidence: [{ source: 'test-fixture' }] },
      content: { renderedContent: { subject: 'Attendance update', body: 'Rendered content' }, context: { source: 'test-fixture' } },
    });
    expect(dependencies.policy.evaluate).toHaveBeenCalledWith(expect.objectContaining(context));
    expect(dependencies.preferenceResolution.resolve).toHaveBeenCalledWith({
      tenantId: context.tenantId, sourceModuleId: context.sourceModuleId, eventType: context.eventType, sourceEventId: context.sourceEventId,
      correlationId: context.correlationId, recipients: [{ recipientId: 'student_001' }], policyDecision: { decision: 'ALLOWED', reason: 'Policy allows this communication.' },
    });
    expect(dependencies.templateResolution.resolve).toHaveBeenCalledWith({
      tenantId: context.tenantId, sourceModuleId: context.sourceModuleId, eventType: context.eventType, sourceEventId: context.sourceEventId,
      correlationId: context.correlationId, event: context, policyDecision: { decision: 'ALLOWED', reason: 'Policy allows this communication.' },
      recipients: [{ recipientId: 'student_001' }], preferences: [{ recipientId: 'student_001', channel: 'EMAIL' }],
    });
  });

  it('stops after business significance for IGNORE', async () => {
    const dependencies = buildDependencies({ decision: 'IGNORE', reason: 'Attendance value did not change.' });
    const result = await createUseCase(dependencies).execute(context);
    expect(result).toEqual({ significance: { decision: 'IGNORE', reason: 'Attendance value did not change.' } });
    expect(dependencies.policy.evaluate).not.toHaveBeenCalled();
    expect(dependencies.recipientResolution.resolve).not.toHaveBeenCalled();
    expect(dependencies.preferenceResolution.resolve).not.toHaveBeenCalled();
    expect(dependencies.templateResolution.resolve).not.toHaveBeenCalled();
    expect(dependencies.audit.recordBusinessSignificance).toHaveBeenCalledTimes(1);
  });

  it('stops after policy suppression and does not resolve recipients', async () => {
    const dependencies = buildDependencies({ decision: 'NOTIFY', reason: 'Attendance changed to ABSENT.' });
    dependencies.policy.evaluate = jest.fn().mockResolvedValue({ decision: 'SUPPRESSED', reason: 'Tenant policy suppresses this communication.' });
    const result = await createUseCase(dependencies).execute(context);
    expect(result).toEqual({
      significance: { decision: 'NOTIFY', reason: 'Attendance changed to ABSENT.' },
      policy: { decision: 'SUPPRESSED', reason: 'Tenant policy suppresses this communication.' },
    });
    expect(dependencies.recipientResolution.resolve).not.toHaveBeenCalled();
    expect(dependencies.preferenceResolution.resolve).not.toHaveBeenCalled();
    expect(dependencies.templateResolution.resolve).not.toHaveBeenCalled();
  });

  it('stops before preferences and content when no eligible recipients are resolved', async () => {
    const dependencies = buildDependencies({ decision: 'NOTIFY', reason: 'Attendance changed to ABSENT.' });
    dependencies.recipientResolution.resolve = jest.fn().mockResolvedValue({ recipients: [], evidence: [{ source: 'test-fixture' }] });
    const result = await createUseCase(dependencies).execute(context);
    expect(result).toEqual({
      significance: { decision: 'NOTIFY', reason: 'Attendance changed to ABSENT.' },
      policy: { decision: 'ALLOWED', reason: 'Policy allows this communication.' },
      recipients: { recipients: [], evidence: [{ source: 'test-fixture' }] },
    });
    expect(dependencies.preferenceResolution.resolve).not.toHaveBeenCalled();
    expect(dependencies.templateResolution.resolve).not.toHaveBeenCalled();
  });
});
