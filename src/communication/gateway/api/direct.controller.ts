import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { DirectCommunicationDto } from '../dto/broadcast-direct-api.dto';
import { DirectCommunicationUseCase } from '../application/direct-communication.use-case';
import { PublisherAuthGuard } from './publisher-auth.guard';

@Controller('direct')
@UseGuards(PublisherAuthGuard)
export class DirectController {
  constructor(private readonly direct: DirectCommunicationUseCase) {}

  /** POST /api/v1/direct — send one notification to one recipient directly */
  @Post()
  @HttpCode(202)
  async create(@Body() dto: DirectCommunicationDto) {
    const result = await this.direct.execute({
      tenantId: dto.tenantId,
      sourceModuleId: dto.sourceModuleId,
      channel: dto.channel,
      recipient: dto.recipient,
      templateIdentity: dto.templateIdentity,
      templateVersion: dto.templateVersion ? parseInt(dto.templateVersion, 10) : undefined,
      correlationId: dto.correlationId,
      payload: dto.payload,
    });

    return {
      communicationId: result.communicationId,
      deliveryId: result.deliveryId,
      status: result.status,
    };
  }
}
