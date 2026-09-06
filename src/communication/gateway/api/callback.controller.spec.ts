import { createHmac } from 'crypto';
import { callbackSecretFor, verifyCallbackSignature } from './callback.controller';

describe('verifyCallbackSignature', () => {
  const body = JSON.stringify({ deliveryId: 'd-1', outcome: 'DELIVERED' });
  const secret = 'callback-test-secret';
  const digest = createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a valid hex signature and sha256= prefix', () => {
    expect(verifyCallbackSignature(body, digest, secret)).toBe(true);
    expect(verifyCallbackSignature(body, `sha256=${digest}`, secret)).toBe(true);
  });

  it('rejects missing, malformed, or mismatched signatures', () => {
    expect(verifyCallbackSignature(body, undefined, secret)).toBe(false);
    expect(verifyCallbackSignature(body, 'not-a-signature', secret)).toBe(false);
    expect(verifyCallbackSignature(body, digest.slice(0, -1), secret)).toBe(false);
    expect(verifyCallbackSignature(body, digest, '')).toBe(false);
    expect(verifyCallbackSignature(`${body}!`, digest, secret)).toBe(false);
  });
});

describe('callbackSecretFor', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('prefers a provider-specific secret and normalizes provider names', () => {
    process.env.ERP_CALLBACK_SECRET = 'shared';
    process.env.CALLBACK_SECRET_ERP_IN_APP = 'provider-secret';
    expect(callbackSecretFor('erp-in-app')).toBe('provider-secret');
  });

  it('falls back to the shared secret for existing deployments', () => {
    delete process.env.PROVIDER_CALLBACK_SECRET;
    process.env.ERP_CALLBACK_SECRET = 'shared';
    expect(callbackSecretFor('email')).toBe('shared');
  });
});
