import { createHash } from 'node:crypto';

export interface DeliveryJobIdentityInput {
  tenantId: string;
  deliveryId: string;
  intendedAttemptNumber: number;
  executionVersion: string;
}

export class JobIdentityService {
  create(input: DeliveryJobIdentityInput): string {
    const logicalKey = [
      input.tenantId,
      input.deliveryId,
      input.intendedAttemptNumber,
      input.executionVersion,
    ].join('|');

    return createHash('sha256').update(logicalKey, 'utf8').digest('hex');
  }
}
