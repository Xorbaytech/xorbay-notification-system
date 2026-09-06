import {
  Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { UpsertSignificanceRuleDto, UpsertPolicyRuleDto } from '../dto/rules-api.dto';
import {
  UpsertSignificanceRuleUseCase,
  ListSignificanceRulesUseCase,
  DeleteSignificanceRuleUseCase,
  UpsertPolicyRuleUseCase,
  ListPolicyRulesUseCase,
  DeletePolicyRuleUseCase,
} from '../application/management/rules.use-cases';
import { PublisherAuthGuard } from './publisher-auth.guard';

/**
 * Manages BusinessSignificance and Policy rules.
 *
 * POST   /api/v1/rules/significance        — upsert a significance rule
 * GET    /api/v1/rules/significance        — list significance rules
 * DELETE /api/v1/rules/significance/:id   — remove a significance rule
 *
 * POST   /api/v1/rules/policy             — upsert a policy rule
 * GET    /api/v1/rules/policy             — list policy rules
 * DELETE /api/v1/rules/policy/:id        — remove a policy rule
 */
@Controller('rules')
@UseGuards(PublisherAuthGuard)
export class RulesController {
  constructor(
    private readonly upsertSignificance: UpsertSignificanceRuleUseCase,
    private readonly listSignificance: ListSignificanceRulesUseCase,
    private readonly deleteSignificance: DeleteSignificanceRuleUseCase,
    private readonly upsertPolicy: UpsertPolicyRuleUseCase,
    private readonly listPolicy: ListPolicyRulesUseCase,
    private readonly deletePolicy: DeletePolicyRuleUseCase,
  ) {}

  // ── Significance ────────────────────────────────────────────────────────────

  @Post('significance')
  async setSignificance(@Body() dto: UpsertSignificanceRuleDto) {
    return this.upsertSignificance.execute(dto);
  }

  @Get('significance')
  async listSignificanceRules(
    @Query('tenantId') tenantId: string,
    @Query('sourceModuleId') sourceModuleId: string,
  ) {
    return this.listSignificance.execute(tenantId, sourceModuleId);
  }

  @Delete('significance/:id')
  @HttpCode(204)
  async removeSignificance(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    await this.deleteSignificance.execute(id, tenantId);
  }

  // ── Policy ──────────────────────────────────────────────────────────────────

  @Post('policy')
  async setPolicy(@Body() dto: UpsertPolicyRuleDto) {
    return this.upsertPolicy.execute(dto);
  }

  @Get('policy')
  async listPolicyRules(
    @Query('tenantId') tenantId: string,
    @Query('sourceModuleId') sourceModuleId: string,
  ) {
    return this.listPolicy.execute(tenantId, sourceModuleId);
  }

  @Delete('policy/:id')
  @HttpCode(204)
  async removePolicy(
    @Param('id') id: string,
    @Query('tenantId') tenantId: string,
  ) {
    await this.deletePolicy.execute(id, tenantId);
  }
}
