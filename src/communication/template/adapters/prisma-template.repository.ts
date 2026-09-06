import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  TemplatePort,
  TemplateResolutionContext,
  TemplateResolutionResult,
} from '../ports/template.port';

/**
 * Prisma-backed implementation of TemplatePort.
 *
 * Resolves templates stored in the `templates` table by matching on
 * (tenantId, sourceModuleId, eventType, identity, version).
 *
 * Falls back gracefully when no template is found instead of throwing.
 */
@Injectable()
export class PrismaTemplateRepository implements TemplatePort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async resolve(
    context: TemplateResolutionContext,
  ): Promise<TemplateResolutionResult> {
    const identity = this.readString(context.templateIdentity);
    const version = this.readVersion(context.templateVersion);

    // If identity/version are not provided, cannot resolve a template.
    if (!identity || version === undefined) {
      return {
        renderedContent: null,
        context: {
          source: 'prisma-template-repository',
          outcome: 'MISSING_IDENTITY_OR_VERSION',
          tenantId: context.tenantId,
        },
      };
    }

    const record = await this.prisma.template.findUnique({
      where: {
        template_unique: {
          tenantId: context.tenantId,
          sourceModuleId: context.sourceModuleId,
          eventType: context.eventType,
          identity,
          version,
        },
      },
    });

    if (!record) {
      return {
        renderedContent: null,
        context: {
          source: 'prisma-template-repository',
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
      renderedContent: record.content,
      context: {
        source: 'prisma-template-repository',
        outcome: 'TEMPLATE_MATCHED',
        tenantId: record.tenantId,
        sourceModuleId: record.sourceModuleId,
        eventType: record.eventType,
        templateIdentity: record.identity,
        templateVersion: record.version,
      },
    };
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private readVersion(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value)
      ? value
      : undefined;
  }
}
