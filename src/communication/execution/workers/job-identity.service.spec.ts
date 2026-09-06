import { JobIdentityService } from './job-identity.service';

describe('JobIdentityService', () => {
  it('creates the same identity for the same logical delivery attempt', () => {
    const service = new JobIdentityService();
    const input = {
      tenantId: 'tenant-001',
      deliveryId: 'delivery-001',
      intendedAttemptNumber: 1,
      executionVersion: 'v1',
    };

    expect(service.create(input)).toBe(service.create(input));
  });

  it('changes identity when the intended attempt changes', () => {
    const service = new JobIdentityService();

    const first = service.create({
      tenantId: 'tenant-001',
      deliveryId: 'delivery-001',
      intendedAttemptNumber: 1,
      executionVersion: 'v1',
    });

    const second = service.create({
      tenantId: 'tenant-001',
      deliveryId: 'delivery-001',
      intendedAttemptNumber: 2,
      executionVersion: 'v1',
    });

    expect(second).not.toBe(first);
  });

  it('keeps different deliveries isolated even for the same attempt number', () => {
    const service = new JobIdentityService();

    const first = service.create({
      tenantId: 'tenant-001',
      deliveryId: 'delivery-001',
      intendedAttemptNumber: 1,
      executionVersion: 'v1',
    });

    const second = service.create({
      tenantId: 'tenant-001',
      deliveryId: 'delivery-002',
      intendedAttemptNumber: 1,
      executionVersion: 'v1',
    });

    expect(second).not.toBe(first);
  });
});
