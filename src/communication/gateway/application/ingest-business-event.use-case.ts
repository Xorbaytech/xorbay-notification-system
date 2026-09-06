import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { TRANSACTION_CONTEXT, TransactionContextPort } from '../../persistence/ports/transaction-context.port';
import { EVENT_VALIDATOR, EventValidatorPort } from '../../validation/ports/event-validator.port';
import { BusinessEventDto } from '../dto/business-event.dto';
import { MetricsService } from '../../observability/metrics.service';

export interface IngestionResult {
  eventId: string;
  status: 'ACCEPTED';
  correlationId: string;
}

@Injectable()
export class IngestBusinessEventUseCase {
  constructor(
    @Inject(EVENT_VALIDATOR)
    private readonly eventValidator: EventValidatorPort,
    @Inject(TRANSACTION_CONTEXT)
    private readonly transactionContext: TransactionContextPort,
    private readonly metrics: MetricsService,
  ) {}

  async execute(event: BusinessEventDto, publisherKey: string | undefined): Promise<IngestionResult> {
    const expectedKey = process.env.PUBLISHER_API_KEY ?? 'local-development-key';
    if (!publisherKey || publisherKey !== expectedKey) {
      throw new UnauthorizedException({
        error: { code: 'PUBLISHER_AUTHENTICATION_FAILED', message: 'Publisher authentication failed.' },
        correlationId: event.correlationId,
      });
    }

    if (!Number.isInteger(event.aggregate.version) || event.aggregate.version < 1) {
      throw new BadRequestException({
        error: { code: 'EVENT_SCHEMA_INVALID', message: 'aggregate.version must be a positive integer.' },
        correlationId: event.correlationId,
      });
    }

    await this.eventValidator.validate(event);

    const now = new Date();
    const processingRecord = {
      id: randomUUID(),
      tenantId: event.tenantId,
      sourceModuleId: event.publisher.moduleId,
      eventType: event.eventType,
      sourceEventId: event.eventId,
      aggregateId: event.aggregate.id,
      aggregateVersion: event.aggregate.version,
      schemaVersion: event.schemaVersion,
      correlationId: event.correlationId,
      priorityHint: event.priorityHint,
      payload: event.payload,
      status: 'ACCEPTED',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.transactionContext.run(async (tx) => {
      // The repository performs the final composite-identity uniqueness check
      // inside PostgreSQL. This remains safe when two requests arrive concurrently.
      await tx.processedEvents.createProcessingRecord(processingRecord);
    });

    this.metrics.recordEventIngested(event.tenantId, event.publisher.moduleId, 'ACCEPTED');

    return {
      eventId: event.eventId,
      status: 'ACCEPTED',
      correlationId: event.correlationId,
    };
  }
}
