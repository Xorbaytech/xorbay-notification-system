import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * A small distributed gate in front of the ERP recipient resolver.
 *
 * Recipient resolution happens before delivery jobs are created, so BullMQ's
 * delivery limiter cannot protect this HTTP call.  This gate uses the same
 * Redis deployment as BullMQ and therefore applies across all notification
 * instances.  It is deliberately configuration driven; no public API or
 * event contract is changed.
 */
@Injectable()
export class ErpResolverRateLimiter implements OnModuleDestroy {
  private static readonly TAKE_SLOT_SCRIPT = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('PEXPIRE', KEYS[1], ARGV[1])
    end
    return current
  `;

  private readonly logger = new Logger(ErpResolverRateLimiter.name);
  private readonly redis?: Redis;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly acquireTimeoutMs: number;
  private connectPromise?: Promise<void>;
  private redisWarningEmitted = false;

  constructor() {
    this.maxRequests = this.readPositiveInt('ERP_RESOLVER_RATE_LIMIT_MAX', 75);
    this.windowMs = this.readPositiveInt('ERP_RESOLVER_RATE_LIMIT_WINDOW_MS', 1_000);
    this.acquireTimeoutMs = this.readPositiveInt(
      'ERP_RESOLVER_RATE_LIMIT_ACQUIRE_TIMEOUT_MS',
      30_000,
    );

    if (process.env.ERP_RESOLVER_RATE_LIMIT_ENABLED === 'false') {
      return;
    }

    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      connectTimeout: 1_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // ioredis emits connection errors asynchronously.  Always attach a
    // listener so a Redis outage cannot crash the notification process.
    this.redis.on('error', (error) => this.warnRedisOnce(error));
  }

  async acquire(): Promise<void> {
    if (!this.redis || this.maxRequests <= 0) {
      return;
    }

    const deadline = Date.now() + this.acquireTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const count = await this.takeSlot();
        if (count <= this.maxRequests) {
          return;
        }

        const elapsedInWindow = Date.now() % this.windowMs;
        const remainingInWindow = this.windowMs - elapsedInWindow;
        const jitter = Math.floor(Math.random() * 50);
        await this.sleep(Math.min(remainingInWindow + jitter, this.windowMs));
      } catch (error) {
        // The durable outbox remains the safety net if Redis is unavailable.
        // Failing open here preserves availability; ERP's authenticated,
        // independently throttled resolver endpoint still protects itself,
        // and a resulting 429 is requeued with exponential backoff.
        this.warnRedisOnce(error);
        return;
      }
    }

    // Do not block an outbox worker forever.  Let the ERP response decide the
    // retry path when a limiter slot could not be acquired in time.
    this.logger.warn(
      `Resolver rate-limit wait exceeded ${this.acquireTimeoutMs}ms; allowing one request for durable retry handling`,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  private async takeSlot(): Promise<number> {
    if (!this.redis) {
      return 0;
    }
    await this.ensureConnected();

    const windowId = Math.floor(Date.now() / this.windowMs);
    const key = `notification:erp-resolver:rate:${windowId}`;
    const result = await this.redis.eval(
      ErpResolverRateLimiter.TAKE_SLOT_SCRIPT,
      1,
      key,
      String(this.windowMs * 2),
    );
    return Number(result);
  }

  private async ensureConnected(): Promise<void> {
    if (!this.redis || this.redis.status === 'ready') {
      return;
    }
    // A fan-out can start many resolver calls concurrently.  Share one
    // connection handshake; calling connect() once per call races ioredis and
    // causes "stream isn't writeable" errors even while Redis is healthy.
    if (!this.connectPromise && this.redis.status === 'wait') {
      this.connectPromise = this.redis.connect().finally(() => {
        this.connectPromise = undefined;
      });
    }
    if (this.connectPromise) {
      await this.connectPromise;
    }
  }

  private readPositiveInt(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  private warnRedisOnce(error: unknown): void {
    if (this.redisWarningEmitted) {
      return;
    }
    this.redisWarningEmitted = true;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Resolver Redis limiter unavailable; using ERP backoff safety net: ${message}`);
  }

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(1, delayMs)));
  }
}
