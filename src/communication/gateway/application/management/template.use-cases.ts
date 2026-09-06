import { Inject, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// ─── Create Template ──────────────────────────────────────────────────────────

export interface CreateTemplateCommand {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  identity: string;
  version: number;
  content: Record<string, unknown>;
}

@Injectable()
export class CreateTemplateUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(cmd: CreateTemplateCommand) {
    try {
      const record = await this.prisma.template.upsert({
        where: {
          template_unique: {
            tenantId: cmd.tenantId,
            sourceModuleId: cmd.sourceModuleId,
            eventType: cmd.eventType,
            identity: cmd.identity,
            version: cmd.version,
          },
        },
        update: { content: cmd.content as unknown as Prisma.InputJsonValue },
        create: {
          id: randomUUID(),
          tenantId: cmd.tenantId,
          sourceModuleId: cmd.sourceModuleId,
          eventType: cmd.eventType,
          identity: cmd.identity,
          version: cmd.version,
          content: cmd.content as unknown as Prisma.InputJsonValue,
        },
      });

      return {
        id: record.id,
        tenantId: record.tenantId,
        sourceModuleId: record.sourceModuleId,
        eventType: record.eventType,
        identity: record.identity,
        version: record.version,
        content: record.content,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      };
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new ConflictException('Template with this identity+version already exists.');
      }
      throw err;
    }
  }
}

// ─── List Templates ───────────────────────────────────────────────────────────

export interface ListTemplatesQuery {
  tenantId: string;
  sourceModuleId: string;
  eventType?: string;
}

@Injectable()
export class ListTemplatesUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(query: ListTemplatesQuery) {
    const records = await this.prisma.template.findMany({
      where: {
        tenantId: query.tenantId,
        sourceModuleId: query.sourceModuleId,
        ...(query.eventType ? { eventType: query.eventType } : {}),
      },
      orderBy: [{ eventType: 'asc' }, { identity: 'asc' }, { version: 'desc' }],
    });

    return records.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      sourceModuleId: r.sourceModuleId,
      eventType: r.eventType,
      identity: r.identity,
      version: r.version,
      content: r.content,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}

// ─── Get Template ─────────────────────────────────────────────────────────────

@Injectable()
export class GetTemplateUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(id: string, tenantId: string) {
    const record = await this.prisma.template.findFirst({
      where: { id, tenantId },
    });

    if (!record) {
      throw new NotFoundException(`Template ${id} not found.`);
    }

    return {
      id: record.id,
      tenantId: record.tenantId,
      sourceModuleId: record.sourceModuleId,
      eventType: record.eventType,
      identity: record.identity,
      version: record.version,
      content: record.content,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

// ─── Delete Template ──────────────────────────────────────────────────────────

@Injectable()
export class DeleteTemplateUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(id: string, tenantId: string): Promise<void> {
    const record = await this.prisma.template.findFirst({ where: { id, tenantId } });

    if (!record) {
      throw new NotFoundException(`Template ${id} not found.`);
    }

    await this.prisma.template.delete({ where: { id } });
  }
}
