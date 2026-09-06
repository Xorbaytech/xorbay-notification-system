import { Controller, Post, Body, HttpCode, UseGuards } from '@nestjs/common';
import { ScheduleCommunicationUseCase } from '../../execution/dispatcher/schedule-communication.use-case';
import { ScheduleCommunicationDto } from '../dto/communication-api.dto';
import { PublisherAuthGuard } from './publisher-auth.guard';

@Controller('schedules')
@UseGuards(PublisherAuthGuard)
export class ScheduleController {
  constructor(private readonly scheduleCommunication: ScheduleCommunicationUseCase) {}

  @Post()
  @HttpCode(201)
  async schedule(@Body() body: ScheduleCommunicationDto) {
    return this.scheduleCommunication.execute({
      tenantId: body.tenantId,
      deliveryId: body.deliveryId,
      mode: body.mode,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      cronExpression: body.cronExpression,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      timezone: body.timezone,
      correlationId: body.correlationId,
    });
  }
}
