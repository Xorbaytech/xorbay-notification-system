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
import { PreferenceQueryDto, SetPreferenceDto } from '../dto/management-api.dto';
import {
  DeletePreferenceUseCase,
  ListPreferencesUseCase,
  SetPreferenceUseCase,
} from '../application/management/preference.use-cases';
import { PublisherAuthGuard } from './publisher-auth.guard';

@Controller('preferences')
@UseGuards(PublisherAuthGuard)
export class PreferenceController {
  constructor(
    private readonly setPreference: SetPreferenceUseCase,
    private readonly listPreferences: ListPreferencesUseCase,
    private readonly deletePreference: DeletePreferenceUseCase,
  ) {}

  /** POST /api/v1/preferences — set or update a channel preference (upsert) */
  @Post()
  async set(@Body() dto: SetPreferenceDto) {
    return this.setPreference.execute({
      tenantId: dto.tenantId,
      sourceModuleId: dto.sourceModuleId,
      recipientId: dto.recipientId,
      channel: dto.channel,
      decision: dto.decision,
    });
  }

  /** GET /api/v1/preferences?tenantId=&sourceModuleId=&recipientId= — list preferences */
  @Get()
  async list(@Query() query: PreferenceQueryDto) {
    return this.listPreferences.execute({
      tenantId: query.tenantId,
      sourceModuleId: query.sourceModuleId,
      recipientId: query.recipientId,
    });
  }

  /** DELETE /api/v1/preferences/:id?tenantId= — remove a preference */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @Query('tenantId') tenantId: string) {
    await this.deletePreference.execute(id, tenantId);
  }
}
