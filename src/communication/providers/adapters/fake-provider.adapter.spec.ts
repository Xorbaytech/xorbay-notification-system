import { DeliveryExecutionContext } from '../../common/interfaces/delivery-execution-context.port';
import { FakeEmailProvider } from './fake-email.provider';
import { FakeSmsProvider } from './fake-sms.provider';
import { FakePushProvider } from './fake-push.provider';

const context: DeliveryExecutionContext = {
  tenantId: 'tenant-1',
  communicationId: 'communication-1',
  deliveryId: 'delivery-1',
  channel: 'EMAIL',
  recipient: 'user@example.com',
  provider: 'FAKE_EMAIL',
  attemptNumber: 1,
  correlationId: 'test-correlation',
  payload: { key: 'value' },
  eventType: 'TestEvent',
  version: 1,
  executable: true,
};

describe('fake provider adapters', () => {
  it.each([
    ['email', new FakeEmailProvider(), 'FAKE_EMAIL'],
    ['sms', new FakeSmsProvider(), 'FAKE_SMS'],
    ['push', new FakePushProvider(), 'FAKE_PUSH'],
  ])('%s returns a deterministic accepted result', async (_name, provider, providerName) => {
    const result = await provider.dispatch(context);

    expect(result.outcome).toBe('ACCEPTED');
    expect(result.providerMessageId).toBe(`${providerName}:delivery-1:1`);
    expect(result.providerStatusReference).toBe(providerName);
    expect(result.failureCategory).toBeNull();
    expect(result.occurredAt).toBeInstanceOf(Date);
  });

  it('supports deterministic retryable failure configuration', async () => {
    const provider = new FakeEmailProvider({
      result: { outcome: 'FAILED', failureCategory: 'TRANSIENT' },
    });

    const result = await provider.dispatch(context);

    expect(result).toMatchObject({
      outcome: 'FAILED',
      failureCategory: 'TRANSIENT',
    });
  });

  it('supports ambiguous timeout outcomes without converting them to success', async () => {
    const provider = new FakeEmailProvider({
      result: { outcome: 'UNKNOWN', failureCategory: 'TIMEOUT_UNKNOWN' },
    });

    const result = await provider.dispatch(context);

    expect(result.outcome).toBe('UNKNOWN');
    expect(result.failureCategory).toBe('TIMEOUT_UNKNOWN');
  });

  it('supports configurable latency', async () => {
    const provider = new FakeEmailProvider({ latencyMs: 1 });

    const result = await provider.dispatch(context);

    expect(result.outcome).toBe('ACCEPTED');
  });
});
