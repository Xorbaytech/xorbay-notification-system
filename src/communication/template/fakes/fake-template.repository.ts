import {
  TemplatePort,
  TemplateResolutionContext,
  TemplateResolutionResult,
} from '../ports/template.port';

export interface FakeTemplateFixture {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  templateIdentity: string;
  version: number;
  renderedContent: unknown;
}

/**
 * Deterministic MVP template repository.
 *
 * Real template persistence remains outside this adapter. The fixture key is
 * explicit so template identity and version selection stay deterministic.
 */
export class FakeTemplateRepository implements TemplatePort {
  constructor(private readonly fixtures: readonly FakeTemplateFixture[]) {}

  async resolve(
    context: TemplateResolutionContext,
  ): Promise<TemplateResolutionResult> {
    const identity = this.readString(context.templateIdentity);
    const version = this.readVersion(context.templateVersion);

    const fixture = this.fixtures.find(
      (candidate) =>
        candidate.tenantId === context.tenantId &&
        candidate.sourceModuleId === context.sourceModuleId &&
        candidate.eventType === context.eventType &&
        candidate.templateIdentity === identity &&
        candidate.version === version,
    );

    if (!fixture) {
      return {
        renderedContent: null,
        context: {
          source: 'fake-template-repository',
          outcome: 'NO_TEMPLATE',
          tenantId: context.tenantId,
          sourceModuleId: context.sourceModuleId,
          eventType: context.eventType,
          templateIdentity: identity,
          templateVersion: version,
        },
      };
    }

    return {
      renderedContent: fixture.renderedContent,
      context: {
        source: 'fake-template-repository',
        outcome: 'TEMPLATE_MATCHED',
        tenantId: fixture.tenantId,
        sourceModuleId: fixture.sourceModuleId,
        eventType: fixture.eventType,
        templateIdentity: fixture.templateIdentity,
        templateVersion: fixture.version,
      },
    };
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private readVersion(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
  }
}
