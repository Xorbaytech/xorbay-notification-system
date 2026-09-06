import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateRecipientDto, TenantQueryDto, UpdateRecipientDto } from '../dto/management-api.dto';
import {
  DeleteRecipientUseCase,
  GetRecipientUseCase,
  ListRecipientsUseCase,
  UpsertRecipientUseCase,
} from '../application/management/recipient.use-cases';
import { PublisherAuthGuard } from './publisher-auth.guard';

@Controller('recipients')
@UseGuards(PublisherAuthGuard)
export class RecipientController {
  constructor(
    private readonly upsertRecipient: UpsertRecipientUseCase,
    private readonly getRecipient: GetRecipientUseCase,
    private readonly listRecipients: ListRecipientsUseCase,
    private readonly deleteRecipient: DeleteRecipientUseCase,
  ) {}

  /** POST /api/v1/recipients — register or update a recipient */
  @Post()
  async create(@Body() dto: CreateRecipientDto) {
    return this.upsertRecipient.execute({
      tenantId: dto.tenantId,
      sourceModuleId: dto.sourceModuleId,
      recipientId: dto.recipientId,
      profile: dto.profile,
    });
  }

  /** GET /api/v1/recipients?tenantId=&sourceModuleId= — list all recipients */
  @Get()
  async list(@Query() query: TenantQueryDto) {
    return this.listRecipients.execute(query.tenantId, query.sourceModuleId);
  }

  /**
   * GET /api/v1/recipients/:recipientId?tenantId=&sourceModuleId=
   * Fetch a single recipient by their domain-level ID.
   */
  @Get(':recipientId')
  async getOne(
    @Param('recipientId') recipientId: string,
    @Query('tenantId') tenantId: string,
    @Query('sourceModuleId') sourceModuleId: string,
  ) {
    return this.getRecipient.execute(recipientId, tenantId, sourceModuleId);
  }

  /** PUT /api/v1/recipients/:recipientId — update profile */
  @Put(':recipientId')
  async update(
    @Param('recipientId') recipientId: string,
    @Body() dto: UpdateRecipientDto,
  ) {
    return this.upsertRecipient.execute({
      tenantId: dto.tenantId,
      sourceModuleId: dto.sourceModuleId,
      recipientId,
      profile: dto.profile,
    });
  }

  /** DELETE /api/v1/recipients/:recipientId?tenantId=&sourceModuleId= */
  @Delete(':recipientId')
  @HttpCode(204)
  async remove(
    @Param('recipientId') recipientId: string,
    @Query('tenantId') tenantId: string,
    @Query('sourceModuleId') sourceModuleId: string,
  ) {
    await this.deleteRecipient.execute(recipientId, tenantId, sourceModuleId);
  }
}
