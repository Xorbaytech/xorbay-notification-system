import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { RegisterPublisherDto } from '../dto/register-publisher-api.dto';
import { RegisterPublisherUseCase } from '../application/management/register-publisher.use-case';
import { PublisherAuthGuard } from './publisher-auth.guard';

/**
 * Idempotent publisher self-registration.
 *
 * POST /api/v1/management/register-publisher
 *
 * Called by publishers (the ERP) to register their module + event types +
 * default rules + templates in one shot. Every step is an upsert, so calling
 * it on every boot is safe and keeps both sides in sync (OCP: new event types
 * are data, not code).
 */
@Controller('management')
@UseGuards(PublisherAuthGuard)
export class RegisterPublisherController {
  constructor(private readonly registerPublisher: RegisterPublisherUseCase) {}

  @Post('register-publisher')
  async register(@Body() dto: RegisterPublisherDto) {
    return this.registerPublisher.execute(dto);
  }
}
