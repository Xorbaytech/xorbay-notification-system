import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import {
  ProviderEgressPermit,
  ProviderEgressPriority,
  ProviderEgressRateLimiterPort,
} from './ports/provider-egress-rate-limiter.port';
import { redisConnectionOptions } from '../infrastructure/redis/redis-connection';

/**
 * Distributed outbound gate for all platform -> ERP provider callbacks.
 *
 * BullMQ limiters protect each delivery queue independently.  IN_APP and
 * WhatsApp callbacks, however, share one ERP HTTP endpoint and one ERP
 * throttling budget.  This gate is therefore intentionally shared by every
 * callback provider and every notification-platform instance.
 *
 * The standard lane cannot consume the critical reserve.  A Redis Lua script
 * makes the two counters atomic, so multiple worker processes cannot oversell
 * the same callback window.  Redis is already required by BullMQ; if it is
 * unavailable, calls are deferred to the durable delivery retry path rather
 * than creating an uncontrolled burst against ERP.
 */
@Injectable()
export class ProviderEgressRateLimiter
  implements ProviderEgressRateLimiterPort, OnModuleDestroy
{
  private static readonly TAKE_SLOT_SCRIPT = `
    local total = tonumber(redis.call('GET', KEYS[1]) or '0')
    local standard = tonumber(redis.call('GET', KEYS[2]) or '0')
    local maxTotal = tonumber(ARGV[1])
    local standardLimit = tonumber(ARGV[2])
    local isCritical = tonumber(ARGV[3])
    local ttl = tonumber(ARGV[4])

    if total >= maxTotal then return 0 end
    if isCritical == 0 and standard >= standardLimit then return 0 end

    local nextTotal = redis.call('INCR', KEYS[1])
    if nextTotal == 1 then redis.call('PEXPIRE', KEYS[1], ttl) end

    if isCritical == 0 then
      local nextStandard = redis.call('INCR', KEYS[2])
      if nextStandard == 1 then redis.call('PEXPIRE', KEYS[2], ttl) end
    end
    return 1
  `;

  private readonly logger = new Logger(ProviderEgressRateLimiter.name);
  private readonly redis?: Redis;
  private readonly enabled: boolean;
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly criticalReserve: number;
  private readonly acquireTimeoutMs: number;
  private readonly retryDelayMs: number;
  private connectPromise?: Promise<void>;
  private warningEmitted = false;

  constructor() {
    this.enabled = process.env.ERP_CALLBACK_RATE_LIMIT_ENABLED !== 'false';
    this.maxRequests = this.readPositiveInt('ERP_CALLBACK_RATE_LIMIT_MAX', 75);
    this.windowMs = this.readPositiveInt('ERP_CALLBACK_RATE_LIMIT_WINDOW_MS', 1_000);
    this.criticalReserve = Math.min(
      this.readPositiveInt('ERP_CALLBACK_RATE_LIMIT_CRITICAL_RESERVE', 15),
      Math.max(0, this.maxRequests - 1),
    );
    this.acquireTimeoutMs = this.readPositiveInt(
      'ERP_CALLBACK_RATE_LIMIT_ACQUIRE_TIMEOUT_MS',
      15_000,
    );
    this.retryDelayMs = this.readPositiveInt('ERP_CALLBACK_RATE_LIMIT_RETRY_DELAY_MS', 2_000);

    if (!this.enabled) return;

    this.redis = new Redis({
      ...redisConnectionOptions(),
      lazyConnect: true,
      connectTimeout: 1_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // ioredis emits asynchronous errors.  Always consume them so a Redis
    // outage cannot crash the notification process.
    this.redis.on('error', (error) => this.warnOnce(error));
  }

  async acquire(priority: ProviderEgressPriority = 'STANDARD'): Promise<ProviderEgressPermit> {
    if (!this.redis || !this.enabled || this.maxRequests <= 0) {
      return { status: 'ACQUIRED' };
    }

    const deadline = Date.now() + this.acquireTimeoutMs;
    const isCritical = priority === 'CRITICAL';
    while (Date.now() < deadline) {
      try {
        if (await this.takeSlot(isCritical)) return { status: 'ACQUIRED' };
        await this.sleep(this.waitForWindow());
      } catch (error) {
        // BullMQ and the durable outbox remain the source of recovery truth.
        // Defer rather than fail open, which prevents a Redis outage from
        // turning into a synchronized ERP 429 storm.
        this.warnOnce(error);
        return {
          status: 'DEFERRED',
          retryAfterMs: this.retryDelayMs,
          reason: 'Provider egress rate limiter is temporarily unavailable',
        };
      }
    }

    return {
      status: 'DEFERRED',
      retryAfterMs: Math.max(this.retryDelayMs, this.waitForWindow()),
      reason: `Provider callback budget is full; waited ${this.acquireTimeoutMs}ms`,
    };
  }

  async onModuleDestroy(): Promise<void> {
    this.redis?.disconnect();
  }

  private async takeSlot(isCritical: boolean): Promise<boolean> {
    if (!this.redis) return true;
    await this.ensureConnected();
    const windowId = Math.floor(Date.now() / this.windowMs);
    const result = await this.redis.eval(
      ProviderEgressRateLimiter.TAKE_SLOT_SCRIPT,
      2,
      `notification:provider-egress:total:${windowId}`,
      `notification:provider-egress:standard:${windowId}`,
      String(this.maxRequests),
      String(this.maxRequests - this.criticalReserve),
      isCritical ? '1' : '0',
      String(this.windowMs * 2),
    );
    return Number(result) === 1;
  }

  private async ensureConnected(): Promise<void> {
    if (!this.redis || this.redis.status === 'ready') return;
    if (!this.connectPromise && this.redis.status === 'wait') {
      this.connectPromise = this.redis.connect().finally(() => {
        this.connectPromise = undefined;
      });
    }
    if (this.connectPromise) await this.connectPromise;
  }

  private waitForWindow(): number {
    const elapsed = Date.now() % this.windowMs;
    const jitter = Math.floor(Math.random() * 50);
    return Math.max(1, Math.min(this.windowMs - elapsed + jitter, this.windowMs + 50));
  }

  private readPositiveInt(name: string, fallback: number): number {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  private warnOnce(error: unknown): void {
    if (this.warningEmitted) return;
    this.warningEmitted = true;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Provider egress Redis limiter unavailable: ${message}`);
  }

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.max(1, delayMs)));
  }
}
