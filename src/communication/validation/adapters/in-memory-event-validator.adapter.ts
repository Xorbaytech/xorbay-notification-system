import { BadRequestException, Injectable } from '@nestjs/common';
import { EventValidatorPort } from '../ports/event-validator.port';

@Injectable()
export class InMemoryEventValidatorAdapter implements EventValidatorPort {
  private readonly registeredModules = new Set(['attendance']);
  private readonly registeredEventTypes = new Set(['AttendanceMarked']);

  validate(event: any): void {
    if (!this.registeredModules.has(event.publisher.moduleId)) {
      throw new BadRequestException({
        error: { code: 'MODULE_NOT_REGISTERED', message: 'Publisher module is not registered.' },
        correlationId: event.correlationId,
      });
    }

    if (!this.registeredEventTypes.has(event.eventType)) {
      throw new BadRequestException({
        error: { code: 'EVENT_TYPE_NOT_REGISTERED', message: 'Event type is not registered.' },
        correlationId: event.correlationId,
      });
    }
  }
}
