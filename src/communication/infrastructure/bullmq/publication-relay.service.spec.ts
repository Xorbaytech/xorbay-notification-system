import {
  PublicationRelayService,
  QUEUE_COMMAND_SCHEMA_VERSION,
} from './publication-relay.service';
import { QueuePublicationRecord, QueuePublicationRepositoryPort } from '../../persistence/ports/queue-publication-repository.port';
import { DeliveryQueuePort } from '../../common/interfaces/delivery-queue.port';
import { QueueBatchSubmissionError } from './bullmq-delivery-queue.adapter';

const publication = (): QueuePublicationRecord => ({
  id: 'pub-001',
  tenantId: 'tenant-001',
  aggregateType: 'DELIVERY',
  aggregateId: 'delivery-001',
  workType: 'DELIVERY_EXECUTION',
  stableJobKey: 'tenant-001:DELIVERY_EXECUTION:delivery-001',
  payloadReference: null,
  status: 'PENDING',
  attemptCount: 0,
  availableAt: new Date('2026-08-14T12:00:00Z'),
  lastAttemptAt: null,
  acceptedAt: null,
  failureCode: null,
  failureReason: null,
  correlationId: 'corr-001',
  createdAt: new Date('2026-08-14T11:59:00Z'),
  updatedAt: new Date('2026-08-14T11:59:00Z'),
});

describe('PublicationRelayService', () => {
  let repository: jest.Mocked<QueuePublicationRepositoryPort>;
  let queue: jest.Mocked<DeliveryQueuePort>;
  let service: PublicationRelayService;
  const now = new Date('2026-08-14T12:00:00Z');

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findByStableJobKey: jest.fn(),
      claimNext: jest.fn(),
      markAccepted: jest.fn(),
      markRecoveryRequired: jest.fn(),
    };

    queue = {
      submit: jest.fn(),
      exists: jest.fn(),
    };

    service = new PublicationRelayService(repository, queue);
  });

  it('returns IDLE when no publication is available', async () => {
    repository.claimNext.mockResolvedValue(null);

    await expect(service.runOnce(now)).resolves.toEqual({ status: 'IDLE' });
    expect(queue.exists).not.toHaveBeenCalled();
    expect(queue.submit).not.toHaveBeenCalled();
  });

  it('submits a stable QueueCommand and marks publication accepted', async () => {
    repository.claimNext.mockResolvedValue(publication());
    queue.exists.mockResolvedValue(false);
    queue.submit.mockResolvedValue({ jobId: 'job-001' });
    repository.markAccepted.mockResolvedValue({ ...publication(), status: 'ACCEPTED' });

    await expect(service.runOnce(now)).resolves.toEqual({
      status: 'ACCEPTED',
      publicationId: 'pub-001',
      jobId: 'job-001',
    });

    expect(queue.submit).toHaveBeenCalledWith({
      stableJobKey: 'tenant-001:DELIVERY_EXECUTION:delivery-001',
      workType: 'DELIVERY_EXECUTION',
      logicalWorkId: 'delivery-001',
      tenantId: 'tenant-001',
      correlationId: 'corr-001',
      schemaVersion: QUEUE_COMMAND_SCHEMA_VERSION,
      priority: 5,
    });
    expect(repository.markAccepted).toHaveBeenCalledWith('pub-001', now);
  });

  it('reconciles an already accepted stable job without publishing again', async () => {
    repository.claimNext.mockResolvedValue(publication());
    queue.exists.mockResolvedValue(true);
    repository.markAccepted.mockResolvedValue({ ...publication(), status: 'ACCEPTED' });

    await expect(service.runOnce(now)).resolves.toEqual({
      status: 'ACCEPTED',
      publicationId: 'pub-001',
    });

    expect(queue.submit).not.toHaveBeenCalled();
    expect(repository.markAccepted).toHaveBeenCalledWith('pub-001', now);
  });

  it('reconciles an ambiguous submit failure when the stable job exists', async () => {
    repository.claimNext.mockResolvedValue(publication());
    queue.exists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    queue.submit.mockRejectedValue(new Error('timeout'));
    repository.markAccepted.mockResolvedValue({ ...publication(), status: 'ACCEPTED' });

    await expect(service.runOnce(now)).resolves.toEqual({
      status: 'ACCEPTED',
      publicationId: 'pub-001',
    });

    expect(repository.markRecoveryRequired).not.toHaveBeenCalled();
  });

  it('marks controlled recovery when publication fails and stable job is absent', async () => {
    repository.claimNext.mockResolvedValue(publication());
    queue.exists.mockResolvedValue(false);
    queue.submit.mockRejectedValue(new Error('redis unavailable'));
    repository.markRecoveryRequired.mockResolvedValue({
      ...publication(),
      status: 'RECOVERY_REQUIRED',
      failureCode: 'QUEUE_PUBLICATION_FAILED',
      failureReason: 'redis unavailable',
    });

    await expect(service.runOnce(now)).resolves.toEqual({
      status: 'RECOVERY_REQUIRED',
      publicationId: 'pub-001',
    });

    expect(repository.markRecoveryRequired).toHaveBeenCalledWith(
      'pub-001',
      'QUEUE_PUBLICATION_FAILED',
      'redis unavailable',
      new Date('2026-08-14T12:01:00Z'),
    );
  });

  it('relays a claimed batch with one bulk queue submission and one acceptance update', async () => {
    const second = { ...publication(), id: 'pub-002', aggregateId: 'delivery-002', stableJobKey: 'tenant-001:DELIVERY_EXECUTION:delivery-002' };
    repository.claimNextBatch = jest.fn().mockResolvedValue([publication(), second]);
    repository.markAcceptedMany = jest.fn().mockResolvedValue(undefined);
    queue.submitMany = jest.fn().mockResolvedValue([{ jobId: 'job-001' }, { jobId: 'job-002' }]);

    await expect(service.runBatch(500, now)).resolves.toEqual({
      status: 'ACCEPTED',
      publicationId: 'pub-001',
      acceptedCount: 2,
      claimedCount: 2,
    });

    expect(queue.submitMany).toHaveBeenCalledTimes(1);
    expect(repository.markAcceptedMany).toHaveBeenCalledWith(['pub-001', 'pub-002'], now);
    expect(queue.submit).not.toHaveBeenCalled();
  });

  it('keeps successful lanes accepted when a priority lane fails', async () => {
    const second = {
      ...publication(),
      id: 'pub-002',
      aggregateId: 'delivery-002',
      stableJobKey: 'tenant-001:DELIVERY_EXECUTION:delivery-002',
      priority: 1,
    };
    repository.claimNextBatch = jest.fn().mockResolvedValue([publication(), second]);
    repository.markAcceptedMany = jest.fn().mockResolvedValue(undefined);
    queue.submitMany = jest.fn().mockRejectedValue(
      new QueueBatchSubmissionError('critical queue unavailable', [{ jobId: 'tenant-001-DELIVERY_EXECUTION-delivery-001' }]),
    );
    queue.exists.mockResolvedValue(false);
    repository.markRecoveryRequired.mockResolvedValue({ ...second, status: 'RECOVERY_REQUIRED' });

    await expect(service.runBatch(500, now)).resolves.toEqual({
      status: 'RECOVERY_REQUIRED',
      publicationId: 'pub-002',
      acceptedCount: 1,
      recoveryCount: 1,
      claimedCount: 2,
    });

    expect(repository.markAcceptedMany).toHaveBeenCalledWith(['pub-001'], now);
    expect(repository.markRecoveryRequired).toHaveBeenCalledWith(
      'pub-002',
      'QUEUE_PUBLICATION_FAILED',
      'critical queue unavailable',
      new Date('2026-08-14T12:01:00Z'),
    );
  });

  it('falls back to the existing single-command contract when bulk is unavailable', async () => {
    const second = { ...publication(), id: 'pub-002', aggregateId: 'delivery-002', stableJobKey: 'tenant-001:DELIVERY_EXECUTION:delivery-002' };
    repository.claimNextBatch = jest.fn().mockResolvedValue([publication(), second]);
    queue.exists.mockResolvedValue(false);
    queue.submit.mockResolvedValue({ jobId: 'job-001' });
    repository.markAccepted.mockResolvedValue({ ...publication(), status: 'ACCEPTED' });

    await expect(service.runBatch(2, now)).resolves.toMatchObject({
      status: 'ACCEPTED',
      acceptedCount: 2,
      claimedCount: 2,
    });

    expect(queue.submit).toHaveBeenCalledTimes(2);
    expect(queue.submitMany).toBeUndefined();
  });
});
