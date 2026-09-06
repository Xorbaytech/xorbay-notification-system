import { FakeTemplateRepository, FakeTemplateFixture } from './fake-template.repository';
import { TemplateResolutionContext } from '../ports/template.port';

describe('FakeTemplateRepository', () => {
  const fixtures: readonly FakeTemplateFixture[] = [
    {
      tenantId: 'tenant-1',
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      templateIdentity: 'attendance-notification',
      version: 2,
      renderedContent: { subject: 'Attendance updated', body: 'Student attendance changed.' },
    },
    {
      tenantId: 'tenant-1',
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      templateIdentity: 'attendance-notification',
      version: 1,
      renderedContent: { subject: 'Old attendance', body: 'Previous template.' },
    },
    {
      tenantId: 'tenant-2',
      sourceModuleId: 'attendance',
      eventType: 'AttendanceMarked',
      templateIdentity: 'attendance-notification',
      version: 2,
      renderedContent: { subject: 'Tenant 2 attendance', body: 'Tenant-specific template.' },
    },
  ];

  const context = (overrides: Partial<TemplateResolutionContext> = {}): TemplateResolutionContext => ({
    tenantId: 'tenant-1',
    sourceModuleId: 'attendance',
    eventType: 'AttendanceMarked',
    sourceEventId: 'evt-1',
    correlationId: 'corr-1',
    event: {},
    policyDecision: {},
    recipients: [],
    preferences: [],
    templateIdentity: 'attendance-notification',
    templateVersion: 2,
    ...overrides,
  });

  it('resolves the exact tenant/module/template/version fixture', async () => {
    const result = await new FakeTemplateRepository(fixtures).resolve(context());

    expect(result.renderedContent).toEqual({
      subject: 'Attendance updated',
      body: 'Student attendance changed.',
    });
    expect(result.context).toMatchObject({
      outcome: 'TEMPLATE_MATCHED',
      templateVersion: 2,
    });
  });

  it('selects the explicitly requested version', async () => {
    const result = await new FakeTemplateRepository(fixtures).resolve(
      context({ templateVersion: 1 }),
    );

    expect(result.renderedContent).toEqual({
      subject: 'Old attendance',
      body: 'Previous template.',
    });
  });

  it('isolates templates by tenant', async () => {
    const result = await new FakeTemplateRepository(fixtures).resolve(
      context({ tenantId: 'tenant-2' }),
    );

    expect(result.renderedContent).toEqual({
      subject: 'Tenant 2 attendance',
      body: 'Tenant-specific template.',
    });
  });

  it('returns deterministic no-template evidence for a missing fixture', async () => {
    const result = await new FakeTemplateRepository(fixtures).resolve(
      context({ templateVersion: 99 }),
    );

    expect(result.renderedContent).toBeNull();
    expect(result.context).toMatchObject({
      source: 'fake-template-repository',
      outcome: 'NO_TEMPLATE',
      templateVersion: 99,
    });
  });
});
