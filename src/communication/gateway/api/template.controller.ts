import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateTemplateDto, TemplateQueryDto } from '../dto/management-api.dto';
import {
  CreateTemplateUseCase,
  DeleteTemplateUseCase,
  GetTemplateUseCase,
  ListTemplatesUseCase,
} from '../application/management/template.use-cases';
import { PublisherAuthGuard } from './publisher-auth.guard';

@Controller('templates')
@UseGuards(PublisherAuthGuard)
export class TemplateController {
  constructor(
    private readonly createTemplate: CreateTemplateUseCase,
    private readonly listTemplates: ListTemplatesUseCase,
    private readonly getTemplate: GetTemplateUseCase,
    private readonly deleteTemplate: DeleteTemplateUseCase,
  ) {}

  /** POST /api/v1/templates — create or update a template (upsert by identity+version) */
  @Post()
  async create(@Body() dto: CreateTemplateDto) {
    return this.createTemplate.execute({
      tenantId: dto.tenantId,
      sourceModuleId: dto.sourceModuleId,
      eventType: dto.eventType,
      identity: dto.identity,
      version: dto.version,
      content: dto.content,
    });
  }

  /** GET /api/v1/templates?tenantId=&sourceModuleId=&eventType= — list templates */
  @Get()
  async list(@Query() query: TemplateQueryDto) {
    return this.listTemplates.execute({
      tenantId: query.tenantId,
      sourceModuleId: query.sourceModuleId,
      eventType: query.eventType,
    });
  }

  /** GET /api/v1/templates/:id?tenantId= — get single template */
  @Get(':id')
  async getOne(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    return this.getTemplate.execute(id, tenantId);
  }

  /** DELETE /api/v1/templates/:id?tenantId= — remove a template */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    await this.deleteTemplate.execute(id, tenantId);
  }
}
