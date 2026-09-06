import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { PublisherAuthGuard } from './publisher-auth.guard';

const context = (headers: Record<string, string>): ExecutionContext => ({
  switchToHttp: () => ({ getRequest: () => ({ headers }) }),
} as unknown as ExecutionContext);

describe('PublisherAuthGuard', () => {
  const original = process.env.PUBLISHER_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.PUBLISHER_API_KEY;
    else process.env.PUBLISHER_API_KEY = original;
  });

  it('accepts the configured publisher key', () => {
    process.env.PUBLISHER_API_KEY = 'test-key';
    expect(new PublisherAuthGuard().canActivate(context({ 'x-publisher-key': 'test-key' }))).toBe(true);
  });

  it('rejects missing or incorrect keys', () => {
    process.env.PUBLISHER_API_KEY = 'test-key';
    expect(() => new PublisherAuthGuard().canActivate(context({}))).toThrow(UnauthorizedException);
    expect(() => new PublisherAuthGuard().canActivate(context({ 'x-publisher-key': 'wrong' }))).toThrow(UnauthorizedException);
  });
});
