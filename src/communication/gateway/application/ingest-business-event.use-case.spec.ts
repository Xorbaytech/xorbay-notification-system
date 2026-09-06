import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { IngestBusinessEventUseCase } from './ingest-business-event.use-case';
import { TransactionContextPort, TransactionScope } from '../../persistence/ports/transaction-context.port';

const validEvent = {
  eventId: 'evt_01JXXXXXXXXXXXX',
  eventType: 'AttendanceMarked',
  publisher: { moduleId: 'attendance', environment: 'production' },
  tenantId: 'tenant_123',
  aggregate: { id: 'student_456', version: 17 },
  occurredAt: '2026-08-10T05:30:00Z',
  schemaVersion: '1.0',
  payload: { studentId: 'student_456', attendanceStatus: 'ABSENT' },
  correlationId: 'corr_01JXXXXXXXXXXXX',
};

describe('IngestBusinessEventUseCase', () => {
  const validator = { validate: jest.fn() };
  const createProcessingRecord = jest.fn();

  const transactionScope = {
    communications: {},
    deliveries: {},
    attempts: {},
    processedEvents: {
      findByBusinessIdentity: jest.fn(),
      createProcessingRecord,
    },
  } as unknown as TransactionScope;

  const transactionContext = {
    run: jest.fn(async <T>(work: (tx: TransactionScope) => Promise<T>): Promise<T> => work(transactionScope)),
  } as unknown as TransactionContextPort;

  const metrics = { recordEventIngested: jest.fn() } as unknown as any;

  const useCase = new IngestBusinessEventUseCase(validator, transactionContext, metrics);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PUBLISHER_API_KEY = 'local-development-key';
    createProcessingRecord.mockResolvedValue({ created: true, record: {} });
  });

  it('accepts an authenticated valid event and persists the processing record', async () => {
    await expect(useCase.execute(validEvent, 'local-development-key')).resolves.toEqual({
      eventId: validEvent.eventId,
      status: 'ACCEPTED',
      correlationId: validEvent.correlationId,
    });

    expect(validator.validate).toHaveBeenCalledWith(validEvent);
    expect(transactionContext.run).toHaveBeenCalledTimes(1);
    expect(createProcessingRecord).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: validEvent.tenantId,
      sourceModuleId: validEvent.publisher.moduleId,
      eventType: validEvent.eventType,
      sourceEventId: validEvent.eventId,
      aggregateId: validEvent.aggregate.id,
      aggregateVersion: validEvent.aggregate.version,
    }));
  });

  it('keeps the API acceptance contract for an exact duplicate', async () => {
    createProcessingRecord.mockResolvedValueOnce({ created: false, record: {} });

    await expect(useCase.execute(validEvent, 'local-development-key')).resolves.toEqual({
      eventId: validEvent.eventId,
      status: 'ACCEPTED',
      correlationId: validEvent.correlationId,
    });
  });

  it('rejects unauthenticated publishers before persistence', async () => {
    await expect(useCase.execute(validEvent, undefined)).rejects.toThrow(UnauthorizedException);
    expect(validator.validate).not.toHaveBeenCalled();
    expect(transactionContext.run).not.toHaveBeenCalled();
  });

  it('rejects an invalid aggregate version before persistence', async () => {
    await expect(
      useCase.execute(
        { ...validEvent, aggregate: { id: 'student_456', version: 0 } },
        'local-development-key',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(transactionContext.run).not.toHaveBeenCalled();
  });
});
