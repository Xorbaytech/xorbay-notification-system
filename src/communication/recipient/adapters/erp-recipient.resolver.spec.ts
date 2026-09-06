import {
  ErpRecipientResolverAdapter,
} from './erp-recipient.resolver';
import {
  RecipientResolutionContext,
  RecipientResolutionUnavailableError,
} from '../ports/recipient-resolution.port';

const context = (): RecipientResolutionContext => ({
  tenantId: 'tenant-1',
  sourceModuleId: 'erp-core',
  eventType: 'AttendanceMarked',
  sourceEventId: 'event-1',
  correlationId: 'corr-1',
  event: { aggregateId: 'student-1', payload: { status: 'ABSENT' } },
  policyDecision: { decision: 'NOTIFY' },
});

describe('ErpRecipientResolverAdapter', () => {
  const originalFetch = global.fetch;
  const originalApiUrl = process.env.ERP_API_URL;
  const originalSecret = process.env.ERP_RECIPIENT_RESOLVER_SECRET;

  beforeEach(() => {
    process.env.ERP_API_URL = 'http://erp.test';
    process.env.ERP_RECIPIENT_RESOLVER_SECRET = 'resolver-secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiUrl === undefined) delete process.env.ERP_API_URL;
    else process.env.ERP_API_URL = originalApiUrl;
    if (originalSecret === undefined) delete process.env.ERP_RECIPIENT_RESOLVER_SECRET;
    else process.env.ERP_RECIPIENT_RESOLVER_SECRET = originalSecret;
  });

  it('returns ERP recipients and authenticates the callback request', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { recipients: [{ recipientId: 'user-1' }], evidence: [{ source: 'erp' }] } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(new ErpRecipientResolverAdapter().resolve(context())).resolves.toEqual({
      recipients: [{ recipientId: 'user-1' }],
      evidence: [{ source: 'erp' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('http://erp.test/api/notification-integration/recipients?'),
      expect.objectContaining({
        headers: { 'x-notification-resolver-secret': 'resolver-secret' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('does not convert an ERP outage into an empty recipient list', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) as unknown as typeof fetch;

    await expect(new ErpRecipientResolverAdapter().resolve(context())).rejects.toEqual(
      expect.objectContaining({
        name: 'RecipientResolutionUnavailableError',
        transient: true,
      }),
    );
  });

  it('treats a non-success ERP response as transient resolution failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

    await expect(new ErpRecipientResolverAdapter().resolve(context())).rejects.toBeInstanceOf(
      RecipientResolutionUnavailableError,
    );
  });

  it('returns an auditable empty result when the event has no aggregate id', async () => {
    const result = await new ErpRecipientResolverAdapter().resolve({
      ...context(),
      event: { payload: {} },
    });

    expect(result.recipients).toEqual([]);
    expect(result.evidence).toEqual([
      expect.objectContaining({ outcome: 'NO_AGGREGATE_ID' }),
    ]);
  });
});
