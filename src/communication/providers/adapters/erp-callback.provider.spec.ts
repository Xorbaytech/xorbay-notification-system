import {
  ErpCallbackProvider,
  isTransientHttpStatus,
  parseRetryAfterMs,
} from './erp-callback.provider';
import { ProviderEgressRateLimiterPort } from '../ports/provider-egress-rate-limiter.port';

class TestErpCallbackProvider extends ErpCallbackProvider {
  protected readonly channelName = 'IN_APP';
  protected readonly providerName = 'ERP_IN_APP';

  constructor(limiter?: ProviderEgressRateLimiterPort) {
    super(limiter);
  }
}

const context = {
  tenantId: 'tenant-1',
  communicationId: 'communication-1',
  deliveryId: 'delivery-1',
  channel: 'IN_APP',
  recipient: 'user-1',
  provider: 'ERP_IN_APP',
  attemptNumber: 1,
  correlationId: 'correlation-1',
  payload: {},
  eventType: 'TestEvent',
  content: 'Test notification',
  version: 1,
  executable: true,
};

describe('ERP callback retry classification', () => {
  it.each([408, 425, 429, 500, 502, 503])(
    'classifies HTTP %s as transient',
    (status) => {
      expect(isTransientHttpStatus(status)).toBe(true);
    },
  );

  it.each([400, 401, 403, 404, 422])(
    'classifies HTTP %s as permanent',
    (status) => {
      expect(isTransientHttpStatus(status)).toBe(false);
    },
  );

  it('parses Retry-After delta-seconds', () => {
    expect(parseRetryAfterMs('7')).toBe(7_000);
  });

  it('parses Retry-After HTTP dates', () => {
    const now = Date.parse('2026-08-29T00:00:00Z');
    expect(parseRetryAfterMs('Sat, 29 Aug 2026 00:00:07 GMT', now)).toBe(7_000);
  });

  it('ignores malformed Retry-After values', () => {
    expect(parseRetryAfterMs('not-a-delay')).toBeNull();
  });

  it('returns a transient result and provider delay for HTTP 429', async () => {
    const previousUrl = process.env.ERP_API_URL;
    const previousSecret = process.env.ERP_CALLBACK_SECRET;
    process.env.ERP_API_URL = 'http://erp.test';
    process.env.ERP_CALLBACK_SECRET = 'test-secret';

    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: jest.fn().mockReturnValue('7') },
    } as unknown as Response);

    try {
      const result = await new TestErpCallbackProvider().dispatch(context);
      expect(result.outcome).toBe('FAILED');
      expect(result.failureCategory).toBe('TRANSIENT');
      expect(result.retryAfterMs).toBe(7_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
      if (previousUrl === undefined) delete process.env.ERP_API_URL;
      else process.env.ERP_API_URL = previousUrl;
      if (previousSecret === undefined) delete process.env.ERP_CALLBACK_SECRET;
      else process.env.ERP_CALLBACK_SECRET = previousSecret;
    }
  });

  it('defers before HTTP when the shared egress gate is full', async () => {
    const limiter: ProviderEgressRateLimiterPort = {
      acquire: jest.fn().mockResolvedValue({
        status: 'DEFERRED',
        retryAfterMs: 2_000,
        reason: 'test budget exhausted',
      }),
    };
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ outcome: 'DELIVERED' }),
    } as unknown as Response);

    try {
      const result = await new TestErpCallbackProvider(limiter).dispatch(context);
      expect(result).toMatchObject({
        outcome: 'FAILED',
        failureCategory: 'TRANSIENT',
        retryAfterMs: 2_000,
      });
      expect(limiter.acquire).toHaveBeenCalledWith('STANDARD');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
