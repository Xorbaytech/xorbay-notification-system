import { aggregateCommunicationStatus } from './communication-status-aggregator';

describe('aggregateCommunicationStatus', () => {
  it('reports SENT when every delivery is accepted', () => {
    expect(aggregateCommunicationStatus(['SENT', 'SENT'], 'QUEUED')).toBe('SENT');
  });

  it('reports DELIVERED only when every delivery is delivered', () => {
    expect(aggregateCommunicationStatus(['DELIVERED', 'DELIVERED'], 'PROCESSING')).toBe('DELIVERED');
  });

  it('keeps the communication in flight while any delivery is pending', () => {
    expect(aggregateCommunicationStatus(['SENT', 'RETRYING'], 'QUEUED')).toBe('QUEUED');
    expect(aggregateCommunicationStatus(['PROCESSING'], 'PROCESSING')).toBe('PROCESSING');
  });

  it('reports FAILED when a terminal delivery failed', () => {
    expect(aggregateCommunicationStatus(['SENT', 'FAILED'], 'QUEUED')).toBe('FAILED');
  });

  it('preserves cancellation and stored state when there are no deliveries', () => {
    expect(aggregateCommunicationStatus(['CANCELLED', 'CANCELLED'], 'QUEUED')).toBe('CANCELLED');
    expect(aggregateCommunicationStatus([], 'QUEUED')).toBe('QUEUED');
  });
});
