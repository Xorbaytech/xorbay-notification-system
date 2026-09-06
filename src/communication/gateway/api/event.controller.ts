import { Body, Controller, Headers, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IngestBusinessEventUseCase } from '../application/ingest-business-event.use-case';
import { BusinessEventDto } from '../dto/business-event.dto';
import { PublisherAuthGuard } from './publisher-auth.guard';

@Controller('events')
@UseGuards(PublisherAuthGuard)
export class EventController {
  constructor(private readonly ingestBusinessEvent: IngestBusinessEventUseCase) {}

  @Post()
  @HttpCode(202)
  ingest(
    @Body() event: BusinessEventDto,
    @Headers('x-publisher-key') publisherKey?: string,
  ) {
    return this.ingestBusinessEvent.execute(event, publisherKey);
  }
}
