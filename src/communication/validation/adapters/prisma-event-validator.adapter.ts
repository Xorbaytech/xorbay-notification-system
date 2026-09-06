import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EventValidatorPort } from '../ports/event-validator.port';
import { BusinessEventDto } from '../../gateway/dto/business-event.dto';

@Injectable()
export class PrismaEventValidatorAdapter implements EventValidatorPort {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async validate(event: any): Promise<void> {
    const typedEvent = event as BusinessEventDto;
    
    const publisherModule = await this.prisma.publisherModule.findFirst({
      where: {
        tenantId: typedEvent.tenantId,
        moduleId: typedEvent.publisher.moduleId,
        isActive: true,
      },
      include: {
        events: {
          where: {
            eventType: typedEvent.eventType,
            isActive: true,
          }
        }
      }
    });

    if (!publisherModule) {
      throw new BadRequestException({
        error: { code: 'MODULE_NOT_REGISTERED', message: 'Publisher module is not registered or inactive.' },
        correlationId: typedEvent.correlationId,
      });
    }

    if (publisherModule.events.length === 0) {
      throw new BadRequestException({
        error: { code: 'EVENT_TYPE_NOT_REGISTERED', message: 'Event type is not registered or inactive for this module.' },
        correlationId: typedEvent.correlationId,
      });
    }
  }
}
