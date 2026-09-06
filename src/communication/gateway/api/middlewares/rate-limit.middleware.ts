import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly redis: Redis;
  private readonly WINDOW_SECONDS = 60;
  private readonly MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS 
    ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) 
    : 1000;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async use(req: Request, res: Response, next: NextFunction) {
    // Extract tenantId and publisher key
    const tenantId = req.body?.tenantId || req.query?.tenantId || req.headers['x-tenant-id'] || 'anonymous';
    const publisherKey = req.headers['x-publisher-key'] || 'anonymous';
    
    const key = `ratelimit:${tenantId}:${publisherKey}:${req.ip}`;

    try {
      const current = await this.redis.incr(key);
      
      if (current === 1) {
        await this.redis.expire(key, this.WINDOW_SECONDS);
      }

      res.setHeader('X-RateLimit-Limit', this.MAX_REQUESTS);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.MAX_REQUESTS - current));

      if (current > this.MAX_REQUESTS) {
        throw new HttpException({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.'
          }
        }, HttpStatus.TOO_MANY_REQUESTS);
      }

      next();
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // If redis fails, fail-open to not drop traffic
      next();
    }
  }
}
