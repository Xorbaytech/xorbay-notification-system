import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Template } from '@prisma/client';
import * as Handlebars from 'handlebars';
import {
  RenderedContent,
  TemplateEnginePort,
  TemplateRenderRequest,
} from './template-engine.port';

interface CompiledTemplate {
  subject?: Handlebars.TemplateDelegate;
  body: Handlebars.TemplateDelegate;
}

/**
 * DB-backed Handlebars template engine.
 *
 * Resolution order for a delivery:
 *   1. explicit identity from the request (broadcast/direct pass templateIdentity),
 *   2. a Template row keyed by the event type itself (automation default),
 *   3. the built-in fallback strings (never blocks delivery).
 *
 * Compiled delegates are cached per template row (id + updatedAt) so hot paths
 * do not re-query or re-compile.
 */
@Injectable()
export class DbHandlebarsTemplateService implements TemplateEnginePort {
  private readonly logger = new Logger(DbHandlebarsTemplateService.name);

  /** Built-in safety net — keeps the original MVP behaviour for unregistered events. */
  private readonly builtIn: Record<string, CompiledTemplate> = {
    fallback: {
      body: Handlebars.compile(`Hello! An event occurred. Details: {{payload.studentId}} (Aggregate: {{aggregate.id}}).`),
    },
    AttendanceMarked: {
      subject: Handlebars.compile('Attendance update for {{payload.studentName}}'),
      body: Handlebars.compile(`Hello, attendance has been marked for student {{payload.studentId}} ({{payload.status}} on {{payload.date}}).`),
    },
    GenericNotification: {
      body: Handlebars.compile('{{payload.body}}'),
    },
    BroadcastNotification: {
      subject: Handlebars.compile('{{payload.title}}'),
      body: Handlebars.compile('{{#if recipientName}}Hello {{recipientName}},\n\n{{/if}}{{payload.body}}{{#if senderName}}\n\nSent by {{senderName}}{{#if academyName}} from {{academyName}}{{/if}}.{{/if}}'),
    },
    TimetableUpdated: {
      subject: Handlebars.compile('Class timetable updated'),
      body: Handlebars.compile('{{payload.subject}} for {{payload.className}}{{#if payload.batchName}} — {{payload.batchName}}{{/if}} is scheduled on {{payload.day}} from {{payload.startTime}} to {{payload.endTime}}. Tap to view your timetable.'),
    },
    TimetableSlotRemoved: {
      subject: Handlebars.compile('Class removed from timetable'),
      body: Handlebars.compile('{{payload.subject}} for {{payload.className}}{{#if payload.batchName}} — {{payload.batchName}}{{/if}} scheduled on {{payload.day}} from {{payload.startTime}} to {{payload.endTime}} has been removed from the timetable.'),
    },
    TimetableUpdatedTeacher: {
      subject: Handlebars.compile('Your class timetable was updated'),
      body: Handlebars.compile('Your {{payload.subject}} class for {{payload.className}}{{#if payload.batchName}} — {{payload.batchName}}{{/if}} is scheduled on {{payload.day}} from {{payload.startTime}} to {{payload.endTime}}.'),
    },
    TimetableUpdatedStudent: {
      subject: Handlebars.compile('New class scheduled'),
      body: Handlebars.compile('Your {{payload.subject}} class with {{payload.teacherName}} for {{payload.className}}{{#if payload.batchName}} — {{payload.batchName}}{{/if}} is scheduled on {{payload.day}} from {{payload.startTime}} to {{payload.endTime}}.'),
    },
    TimetableSlotRemovedTeacher: {
      subject: Handlebars.compile('Class removed from your timetable'),
      body: Handlebars.compile('Your {{payload.subject}} class for {{payload.className}}{{#if payload.batchName}} — {{payload.batchName}}{{/if}} on {{payload.day}} from {{payload.startTime}} to {{payload.endTime}} has been removed from your timetable.'),
    },
    TimetableSlotRemovedStudent: {
      subject: Handlebars.compile('Class cancelled'),
      body: Handlebars.compile('Your {{payload.subject}} class with {{payload.teacherName}} for {{payload.className}}{{#if payload.batchName}} — {{payload.batchName}}{{/if}} on {{payload.day}} from {{payload.startTime}} to {{payload.endTime}} has been removed from the timetable.'),
    },
    ClassStartingSoonTeacher: {
      subject: Handlebars.compile('Class starts in 10 minutes'),
      body: Handlebars.compile('Your {{payload.subject}} class for {{payload.className}}{{#if payload.batchName}} — {{payload.batchName}}{{/if}} starts in {{payload.minutesRemaining}} minutes at {{payload.startTime}}. Please get ready.'),
    },
    ClassStartingSoonStudent: {
      subject: Handlebars.compile('Your class starts in 10 minutes'),
      body: Handlebars.compile('Your {{payload.subject}} class with {{payload.teacherName}} for {{payload.className}}{{#if payload.batchName}} — {{payload.batchName}}{{/if}} starts in {{payload.minutesRemaining}} minutes at {{payload.startTime}}.'),
    },
    BROADCAST: {
      subject: Handlebars.compile('{{payload.title}}'),
      body: Handlebars.compile('{{payload.body}}'),
    },
  };

  private readonly cache = new Map<string, CompiledTemplate>();

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async render(templateId: string, payload: any): Promise<string> {
    const compiled = this.builtIn[templateId] ?? this.builtIn['fallback'];
    return compiled.body(templateContext(payload));
  }

  async renderFor(request: TemplateRenderRequest): Promise<RenderedContent> {
    const payload = renderDynamicPayload(request.payload ?? {});
    const identity = request.identity || String(payload.templateIdentity || '') || request.eventType;

    const row = await this.findTemplateRow(request, identity);
    // ERP templates use the documented `{{payload.field}}` contract. Keep the
    // original fields at the root as well for older templates such as
    // `{{recipientName}}`; this makes both forms backwards compatible.
    const context = templateContext(payload);
    if (!row) {
      // Manual broadcast/direct calls use a transport event type (BROADCAST or
      // DIRECT) and select their actual copy through templateIdentity. When no
      // database override exists, resolve that identity against the built-ins
      // before falling back to the transport event; otherwise the dispatcher
      // would render the generic fallback and lose personalization.
      const compiled = this.builtIn[identity] ?? this.builtIn[request.eventType] ?? this.builtIn['fallback'];
      return {
        subject: compiled.subject ? String(compiled.subject(context)) : undefined,
        body: String(compiled.body(context)),
        templateIdentity: request.eventType in this.builtIn ? request.eventType : 'fallback',
      };
    }

    const compiled = this.compile(row);
    return {
      subject: compiled.subject ? String(compiled.subject(context)) : undefined,
      body: String(compiled.body(context)),
      templateIdentity: row.identity,
    };
  }

  private async findTemplateRow(
    request: TemplateRenderRequest,
    identity: string,
  ): Promise<Template | null> {
    const version = request.version ?? Number(payloadVersion(request.payload)) ?? undefined;
    // Broadcast/direct commands are persisted with a transport event type
    // (for example `BROADCAST`) while `templateIdentity` identifies the
    // business template (for example `TimetableUpdated`).  Try both keys so
    // an explicit business template is not lost merely because the command
    // travelled through the generic broadcast pipeline.
    const eventTypes = identity && identity !== request.eventType
      ? [request.eventType, identity]
      : [request.eventType];
    try {
      return await this.prisma.template.findFirst({
        where: {
          tenantId: request.tenantId,
          eventType: { in: eventTypes },
          identity,
          ...(version ? { version } : {}),
          ...(request.sourceModuleId ? { sourceModuleId: request.sourceModuleId } : {}),
        },
        orderBy: version ? undefined : { version: 'desc' },
      });
    } catch (err) {
      this.logger.warn(`Template lookup failed (using fallback): ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  private compile(row: Template): CompiledTemplate {
    const cacheKey = `${row.id}:${row.updatedAt instanceof Date ? row.updatedAt.getTime() : String(row.updatedAt)}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const content = (row.content ?? {}) as Record<string, unknown>;
    const compiled: CompiledTemplate = {
      subject: typeof content.subject === 'string' ? Handlebars.compile(content.subject) : undefined,
      body: Handlebars.compile(
        typeof content.body === 'string' ? content.body : JSON.stringify(content, null, 2),
      ),
    };

    if (this.cache.size > 500) this.cache.clear();
    this.cache.set(cacheKey, compiled);
    return compiled;
  }
}

function templateContext(payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const values = payload ?? {};
  return { ...values, payload: values };
}

/**
 * Broadcast/direct callers may provide body text containing the same
 * personalization tokens used by DB templates (for example
 * `Hello {{recipientName}}`). Render that caller-owned text once before the
 * outer template is evaluated. This keeps the template engine as the single
 * personalization boundary and avoids literal handlebars in bell cards.
 */
function renderDynamicPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const context = templateContext(payload);
  const rendered = { ...payload };
  for (const key of ['title', 'subject', 'body']) {
    const value = rendered[key];
    if (typeof value !== 'string' || !value.includes('{{')) continue;
    try {
      rendered[key] = Handlebars.compile(value, { noEscape: true })(context);
    } catch {
      // Preserve caller content if a user-provided expression is malformed;
      // the normal outer template/fallback path still remains deliverable.
    }
  }
  return rendered;
}

function payloadVersion(payload: Record<string, unknown>): number | null {
  const v = payload?.templateVersion;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}
