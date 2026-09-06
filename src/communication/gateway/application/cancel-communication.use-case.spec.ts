import { NotFoundException, ConflictException } from '@nestjs/common';
import { CancelCommunicationUseCase } from './cancel-communication.use-case';
import { DeliveryRepositoryPort } from '../../persistence/ports/delivery-repository.port';

const buildDeliveryRepo = (overrides: Partial<jest.Mocked<DeliveryRepositoryPort>> = {}): jest.Mocked<DeliveryRepositoryPort> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByCommunicationId: jest.fn().mockResolvedValue([]),
  findByTenantAndStatus: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
  claimForExecution: jest.fn(),
  ...overrides,
});

const baseCommand = {
  communicationId: 'comm-1',
  tenantId: 'tenant-1',
  correlationId: 'corr-1',
};

describe('CancelCommunicationUseCase', () => {
  it('cancels PLANNED deliveries', async () => {
    const deliveries = buildDeliveryRepo({
      findByCommunicationId: jest.fn().mockResolvedValue([
        {
          id: 'del-1', status: 'PLANNED', version: 1,
          communicationId: 'comm-1', tenantId: 'tenant-1',
          channel: 'EMAIL', recipient: 'u@e.com', attemptCount: 0,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]),
    });

    const useCase = new CancelCommunicationUseCase(deliveries);
    const result = await useCase.execute(baseCommand);

    expect(result.cancelledDeliveries).toContain('del-1');
    expect(deliveries.update).toHaveBeenCalledWith('del-1', 'tenant-1', { status: 'CANCELLED', version: 2 });
  });

  it('cancels QUEUED deliveries', async () => {
    const deliveries = buildDeliveryRepo({
      findByCommunicationId: jest.fn().mockResolvedValue([
        {
          id: 'del-2', status: 'QUEUED', version: 2,
          communicationId: 'comm-1', tenantId: 'tenant-1',
          channel: 'SMS', recipient: '+1234', attemptCount: 0,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]),
    });

    const useCase = new CancelCommunicationUseCase(deliveries);
    const result = await useCase.execute(baseCommand);

    expect(result.cancelledDeliveries).toContain('del-2');
  });

  it('skips terminal (DELIVERED, FAILED, CANCELLED) deliveries', async () => {
    const deliveries = buildDeliveryRepo({
      findByCommunicationId: jest.fn().mockResolvedValue([
        {
          id: 'del-3', status: 'DELIVERED', version: 5,
          communicationId: 'comm-1', tenantId: 'tenant-1',
          channel: 'EMAIL', recipient: 'u@e.com', attemptCount: 1,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]),
    });

    const useCase = new CancelCommunicationUseCase(deliveries);
    const result = await useCase.execute(baseCommand);

    expect(result.cancelledDeliveries).toHaveLength(0);
    expect(result.skippedDeliveries).toContain('del-3');
    expect(deliveries.update).not.toHaveBeenCalled();
  });

  it('throws 409 when all non-terminal deliveries are PROCESSING', async () => {
    const deliveries = buildDeliveryRepo({
      findByCommunicationId: jest.fn().mockResolvedValue([
        {
          id: 'del-4', status: 'PROCESSING', version: 3,
          communicationId: 'comm-1', tenantId: 'tenant-1',
          channel: 'EMAIL', recipient: 'u@e.com', attemptCount: 1,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]),
    });

    const useCase = new CancelCommunicationUseCase(deliveries);

    await expect(useCase.execute(baseCommand)).rejects.toThrow(ConflictException);
  });

  it('throws 404 when no deliveries found (communication not found)', async () => {
    const deliveries = buildDeliveryRepo({
      findByCommunicationId: jest.fn().mockResolvedValue([]),
    });

    const useCase = new CancelCommunicationUseCase(deliveries);

    await expect(useCase.execute(baseCommand)).rejects.toThrow(NotFoundException);
  });

  it('cancels PLANNED deliveries even if some are PROCESSING (partial cancel)', async () => {
    const deliveries = buildDeliveryRepo({
      findByCommunicationId: jest.fn().mockResolvedValue([
        {
          id: 'del-planned', status: 'PLANNED', version: 1,
          communicationId: 'comm-1', tenantId: 'tenant-1',
          channel: 'EMAIL', recipient: 'u@e.com', attemptCount: 0,
          createdAt: new Date(), updatedAt: new Date(),
        },
        {
          id: 'del-processing', status: 'PROCESSING', version: 2,
          communicationId: 'comm-1', tenantId: 'tenant-1',
          channel: 'SMS', recipient: '+1234', attemptCount: 1,
          createdAt: new Date(), updatedAt: new Date(),
        },
      ]),
    });

    const useCase = new CancelCommunicationUseCase(deliveries);
    const result = await useCase.execute(baseCommand);

    expect(result.cancelledDeliveries).toContain('del-planned');
    expect(result.conflicts).toContain('del-processing');
    // No 409 thrown because at least one was cancelled
  });
});
