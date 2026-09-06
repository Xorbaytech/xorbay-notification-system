import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

// ─── Significance Rule use cases ──────────────────────────────────────────────

export interface UpsertSignificanceRuleCommand {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  decision: string; // NOTIFY | IGNORE | AUDIT_ONLY
  priority?: number;
}

@Injectable()
export class UpsertSignificanceRuleUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(cmd: UpsertSignificanceRuleCommand) {
    const record = await this.prisma.significanceRule.upsert({
      where: {
        significance_rule_unique: {
          tenantId: cmd.tenantId,
          sourceModuleId: cmd.sourceModuleId,
          eventType: cmd.eventType,
        },
      },
      update: { decision: cmd.decision, priority: cmd.priority ?? 0 },
      create: {
        id: randomUUID(),
        tenantId: cmd.tenantId,
        sourceModuleId: cmd.sourceModuleId,
        eventType: cmd.eventType,
        decision: cmd.decision,
        priority: cmd.priority ?? 0,
      },
    });
    return record;
  }
}

@Injectable()
export class ListSignificanceRulesUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(tenantId: string, sourceModuleId: string) {
    return this.prisma.significanceRule.findMany({
      where: { tenantId, sourceModuleId },
      orderBy: [{ eventType: 'asc' }],
    });
  }
}

@Injectable()
export class DeleteSignificanceRuleUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(id: string, tenantId: string): Promise<void> {
    const rule = await this.prisma.significanceRule.findFirst({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Significance rule ${id} not found.`);
    await this.prisma.significanceRule.delete({ where: { id } });
  }
}

// ─── Policy Rule use cases ────────────────────────────────────────────────────

export interface UpsertPolicyRuleCommand {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  decision: string; // ALLOWED | SUPPRESSED
  templateIdentity?: string;
  templateVersion?: number;
  reason?: string;
}

@Injectable()
export class UpsertPolicyRuleUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(cmd: UpsertPolicyRuleCommand) {
    const record = await this.prisma.policyRule.upsert({
      where: {
        policy_rule_unique: {
          tenantId: cmd.tenantId,
          sourceModuleId: cmd.sourceModuleId,
          eventType: cmd.eventType,
        },
      },
      update: {
        decision: cmd.decision,
        templateIdentity: cmd.templateIdentity ?? null,
        templateVersion: cmd.templateVersion ?? null,
        reason: cmd.reason ?? null,
      },
      create: {
        id: randomUUID(),
        tenantId: cmd.tenantId,
        sourceModuleId: cmd.sourceModuleId,
        eventType: cmd.eventType,
        decision: cmd.decision,
        templateIdentity: cmd.templateIdentity ?? null,
        templateVersion: cmd.templateVersion ?? null,
        reason: cmd.reason ?? null,
      },
    });
    return record;
  }
}

@Injectable()
export class ListPolicyRulesUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(tenantId: string, sourceModuleId: string) {
    return this.prisma.policyRule.findMany({
      where: { tenantId, sourceModuleId },
      orderBy: [{ eventType: 'asc' }],
    });
  }
}

@Injectable()
export class DeletePolicyRuleUseCase {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(id: string, tenantId: string): Promise<void> {
    const rule = await this.prisma.policyRule.findFirst({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Policy rule ${id} not found.`);
    await this.prisma.policyRule.delete({ where: { id } });
  }
}
