import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// ─── Upsert Recipient ─────────────────────────────────────────────────────────

export interface UpsertRecipientCommand {
  tenantId: string;
  sourceModuleId: string;
  recipientId: string;
  profile: Record<string, unknown>;
}

@Injectable()
export class UpsertRecipientUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(cmd: UpsertRecipientCommand) {
    const record = await this.prisma.recipient.upsert({
      where: {
        recipient_unique: {
          tenantId: cmd.tenantId,
          sourceModuleId: cmd.sourceModuleId,
          recipientId: cmd.recipientId,
        },
      },
      update: { profile: cmd.profile as unknown as Prisma.InputJsonValue },
      create: {
        id: randomUUID(),
        tenantId: cmd.tenantId,
        sourceModuleId: cmd.sourceModuleId,
        recipientId: cmd.recipientId,
        profile: cmd.profile as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      id: record.id,
      tenantId: record.tenantId,
      sourceModuleId: record.sourceModuleId,
      recipientId: record.recipientId,
      profile: record.profile,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

// ─── Get Recipient ────────────────────────────────────────────────────────────

@Injectable()
export class GetRecipientUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(recipientId: string, tenantId: string, sourceModuleId: string) {
    const record = await this.prisma.recipient.findUnique({
      where: {
        recipient_unique: { tenantId, sourceModuleId, recipientId },
      },
    });

    if (!record) {
      throw new NotFoundException(`Recipient '${recipientId}' not found.`);
    }

    return {
      id: record.id,
      tenantId: record.tenantId,
      sourceModuleId: record.sourceModuleId,
      recipientId: record.recipientId,
      profile: record.profile,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

// ─── List Recipients ──────────────────────────────────────────────────────────

@Injectable()
export class ListRecipientsUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(tenantId: string, sourceModuleId: string) {
    const records = await this.prisma.recipient.findMany({
      where: { tenantId, sourceModuleId },
      orderBy: { recipientId: 'asc' },
    });

    return records.map((r) => ({
      id: r.id,
      tenantId: r.tenantId,
      sourceModuleId: r.sourceModuleId,
      recipientId: r.recipientId,
      profile: r.profile,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}

// ─── Delete Recipient ─────────────────────────────────────────────────────────

@Injectable()
export class DeleteRecipientUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(recipientId: string, tenantId: string, sourceModuleId: string): Promise<void> {
    const record = await this.prisma.recipient.findUnique({
      where: {
        recipient_unique: { tenantId, sourceModuleId, recipientId },
      },
    });

    if (!record) {
      throw new NotFoundException(`Recipient '${recipientId}' not found.`);
    }

    await this.prisma.recipient.delete({ where: { id: record.id } });
  }
}
