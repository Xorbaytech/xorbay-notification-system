import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// ─── Set Preference ───────────────────────────────────────────────────────────

export interface SetPreferenceCommand {
  tenantId: string;
  sourceModuleId: string;
  recipientId: string;
  channel: string;
  decision: 'ALLOW' | 'DENY';
}

@Injectable()
export class SetPreferenceUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(cmd: SetPreferenceCommand) {
    const record = await this.prisma.preference.upsert({
      where: {
        preference_unique: {
          tenantId: cmd.tenantId,
          sourceModuleId: cmd.sourceModuleId,
          recipientId: cmd.recipientId,
          channel: cmd.channel,
        },
      },
      update: { decision: cmd.decision },
      create: {
        id: randomUUID(),
        tenantId: cmd.tenantId,
        sourceModuleId: cmd.sourceModuleId,
        recipientId: cmd.recipientId,
        channel: cmd.channel,
        decision: cmd.decision,
      },
    });

    return {
      id: record.id,
      tenantId: record.tenantId,
      sourceModuleId: record.sourceModuleId,
      recipientId: record.recipientId,
      channel: record.channel,
      decision: record.decision,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

// ─── List Preferences ─────────────────────────────────────────────────────────

export interface ListPreferencesQuery {
  tenantId: string;
  sourceModuleId: string;
  recipientId?: string;
}

@Injectable()
export class ListPreferencesUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(query: ListPreferencesQuery) {
    const records = await this.prisma.preference.findMany({
      where: {
        tenantId: query.tenantId,
        sourceModuleId: query.sourceModuleId,
        ...(query.recipientId ? { recipientId: query.recipientId } : {}),
      },
      orderBy: [{ recipientId: 'asc' }, { channel: 'asc' }],
    });

    return records.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      sourceModuleId: r.sourceModuleId,
      recipientId: r.recipientId,
      channel: r.channel,
      decision: r.decision,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}

// ─── Delete Preference ────────────────────────────────────────────────────────

@Injectable()
export class DeletePreferenceUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(id: string, tenantId: string): Promise<void> {
    const record = await this.prisma.preference.findFirst({
      where: { id, tenantId },
    });

    if (!record) {
      throw new NotFoundException(`Preference ${id} not found.`);
    }

    await this.prisma.preference.delete({ where: { id } });
  }
}
