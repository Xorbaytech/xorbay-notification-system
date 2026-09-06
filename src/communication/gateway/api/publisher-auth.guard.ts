import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * Authenticates calls made by an ERP publisher.  Publisher APIs are server to
 * server endpoints; the shared key is deliberately carried in a header and
 * never accepted from the request body or query string.
 */
@Injectable()
export class PublisherAuthGuard implements CanActivate {
  private authenticationError(): UnauthorizedException {
    return new UnauthorizedException({
      error: {
        code: 'PUBLISHER_AUTHENTICATION_FAILED',
        message: 'Publisher authentication failed.',
      },
    });
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | string[]> }>();
    const raw = request.headers?.['x-publisher-key'];
    const supplied = Array.isArray(raw) ? raw[0] : raw;
    const expected = process.env.PUBLISHER_API_KEY;
    if (!expected || !supplied) throw this.authenticationError();
    const a = Buffer.from(String(supplied));
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw this.authenticationError();
    }
    return true;
  }
}
