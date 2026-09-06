import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export interface RegisterEventCommand {
  eventType: string;
  /** Template identity this event's policy binds to (defaults to the event type). */
  templateIdentity?: string;
  /** Template content to ensure for this event ({ subject, body } — Handlebars). */
  template?: {
    subject?: string;
    body: string;
  };
  /** Override the significance decision (default NOTIFY). */
  significanceDecision?: 'NOTIFY' | 'IGNORE' | 'AUDIT_ONLY';
}

export interface RegisterPublisherCommand {
  tenantId: string;
  moduleId: string;
  name?: string;
  events: RegisterEventCommand[];
}

/**
 * Idempotent self-registration for publishers (the ERP calls this on boot /
 * first publish). Upserts: PublisherModule → PublisherEventTypes →
 * SignificanceRule (NOTIFY) → PolicyRule (ALLOWED + template binding) →
 * Template row when content is provided. Safe to call repeatedly — every step
 * is an upsert keyed by its natural unique constraint.
 */
@Injectable()
export class RegisterPublisherUseCase {
  private readonly logger = new Logger(RegisterPublisherUseCase.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(cmd: RegisterPublisherCommand) {
    const now = new Date();

    const publisherModule = await this.prisma.publisherModule.upsert({
      where: { publisher_module_unique: { tenantId: cmd.tenantId, moduleId: cmd.moduleId } },
      update: { name: cmd.name ?? cmd.moduleId, isActive: true, updatedAt: now },
      create: {
        id: randomUUID(),
        tenantId: cmd.tenantId,
        moduleId: cmd.moduleId,
        name: cmd.name ?? cmd.moduleId,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });

    const registered: { eventType: string; templateIdentity: string }[] = [];

    for (const evt of cmd.events) {
      const templateIdentity = evt.templateIdentity ?? evt.eventType;

      await this.prisma.publisherEventType.upsert({
        where: {
          publisher_event_type_unique: {
            moduleId: publisherModule.id,
            eventType: evt.eventType,
          },
        },
        update: { isActive: true, updatedAt: now },
        create: {
          id: randomUUID(),
          moduleId: publisherModule.id,
          eventType: evt.eventType,
          schemaVersion: '1.0',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.prisma.significanceRule.upsert({
        where: {
          significance_rule_unique: {
            tenantId: cmd.tenantId,
            sourceModuleId: cmd.moduleId,
            eventType: evt.eventType,
          },
        },
        update: {
          decision: evt.significanceDecision ?? 'NOTIFY',
          isActive: true,
          updatedAt: now,
        },
        create: {
          id: randomUUID(),
          tenantId: cmd.tenantId,
          sourceModuleId: cmd.moduleId,
          eventType: evt.eventType,
          decision: evt.significanceDecision ?? 'NOTIFY',
          priority: 0,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      });

      await this.prisma.policyRule.upsert({
        where: {
          policy_rule_unique: {
            tenantId: cmd.tenantId,
            sourceModuleId: cmd.moduleId,
            eventType: evt.eventType,
          },
        },
        update: {
          decision: 'ALLOWED',
          templateIdentity,
          templateVersion: 1,
          isActive: true,
          updatedAt: now,
        },
        create: {
          id: randomUUID(),
          tenantId: cmd.tenantId,
          sourceModuleId: cmd.moduleId,
          eventType: evt.eventType,
          decision: 'ALLOWED',
          templateIdentity,
          templateVersion: 1,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      });

      if (evt.template) {
        await this.prisma.template.upsert({
          where: {
            template_unique: {
              tenantId: cmd.tenantId,
              sourceModuleId: cmd.moduleId,
              eventType: evt.eventType,
              identity: templateIdentity,
              version: 1,
            },
          },
          update: {
            content: evt.template as unknown as Prisma.InputJsonValue,
            updatedAt: now,
          },
          create: {
            id: randomUUID(),
            tenantId: cmd.tenantId,
            sourceModuleId: cmd.moduleId,
            eventType: evt.eventType,
            identity: templateIdentity,
            version: 1,
            content: evt.template as unknown as Prisma.InputJsonValue,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      registered.push({ eventType: evt.eventType, templateIdentity });
    }

    this.logger.log(
      `Registered publisher ${cmd.tenantId}/${cmd.moduleId} with ${registered.length} event types`,
    );

    return {
      publisherModuleId: publisherModule.id,
      tenantId: cmd.tenantId,
      moduleId: cmd.moduleId,
      events: registered,
    };
  }
}
