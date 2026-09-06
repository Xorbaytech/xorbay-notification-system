import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { BroadcastCommunicationDto } from '../dto/broadcast-direct-api.dto';
import { BroadcastCommunicationUseCase } from '../application/broadcast-communication.use-case';
import { PublisherAuthGuard } from './publisher-auth.guard';

@Controller('broadcasts')
@UseGuards(PublisherAuthGuard)
export class BroadcastController {
  constructor(private readonly broadcast: BroadcastCommunicationUseCase) {}

  /** POST /api/v1/broadcasts — send to many recipients in one call */
  @Post()
  @HttpCode(202)
  async create(@Body() dto: BroadcastCommunicationDto) {
    const result = await this.broadcast.execute({
      tenantId: dto.tenantId,
      sourceModuleId: dto.sourceModuleId,
      templateIdentity: dto.templateIdentity,
      templateVersion: dto.templateVersion ? parseInt(dto.templateVersion, 10) : undefined,
      correlationId: dto.correlationId,
      recipients: dto.recipients.map((r) => ({
        recipientId: r.recipientId,
        profile: r.profile,
      })),
      channel: dto.channel,
      payload: dto.payload,
      idempotencyKey: dto.idempotencyKey,
    });

    return {
      communicationId: result.communicationId,
      deliveryCount: result.deliveryCount,
      status: result.status,
      ...(result.campaignId
        ? {
            campaignId: result.campaignId,
            batchCount: result.batchCount,
          }
        : {}),
    };
  }
}
