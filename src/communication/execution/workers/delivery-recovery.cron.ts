import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DELIVERY_REPOSITORY,
  DeliveryRepositoryPort,
} from '../../persistence/ports/delivery-repository.port';
import { RecoverStaleDeliveryUseCase } from '../dispatcher/recover-stale-delivery.use-case';
import { MetricsService } from '../../observability/metrics.service';

const DEFAULT_PROCESSING_TIMEOUT_MS = 2 * 60_000;
const DEFAULT_RECOVERY_BATCH_SIZE = 100;

/**
 * Periodically reconciles deliveries left PROCESSING by a crashed worker.
 *
 * The cron only discovers a bounded candidate set. The use case performs the
 * tenant-scoped version/CAS checks and durable state transition, so multiple
 * application instances can run this safely without duplicate retries.
 */
@Injectable()
export class DeliveryRecoveryCron {
  private readonly logger = new Logger(DeliveryRecoveryCron.name);
  private isRunning = false;

  constructor(
    @Inject(DELIVERY_REPOSITORY)
    private readonly deliveries: DeliveryRepositoryPort,
    private readonly recoverStaleDelivery: RecoverStaleDeliveryUseCase,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleCron(): Promise<void> {
    if (this.isRunning) return;
    if (!this.deliveries.findStaleProcessing) return;

    this.isRunning = true;
    try {
      const now = new Date();
      const timeoutMs = readBoundedInteger(
        process.env.DELIVERY_PROCESSING_TIMEOUT_MS,
        DEFAULT_PROCESSING_TIMEOUT_MS,
        10_000,
        15 * 60_000,
      );
      const batchSize = readBoundedInteger(
        process.env.DELIVERY_RECOVERY_BATCH_SIZE,
        DEFAULT_RECOVERY_BATCH_SIZE,
        1,
        500,
      );
      const candidates = await this.deliveries.findStaleProcessing(
        new Date(now.getTime() - timeoutMs),
        batchSize,
      );

      if (candidates.length === 0) return;

      let recovered = 0;
      let terminal = 0;
      let skipped = 0;
      for (const delivery of candidates) {
        try {
          const result = await this.recoverStaleDelivery.execute({
            delivery,
            now,
            timeoutMs,
          });
          this.metrics?.recordDeliveryRecovery(result.action);
          if (result.action === 'RETRY') recovered += 1;
          else if (result.action === 'TERMINAL') terminal += 1;
          else skipped += 1;
        } catch (error) {
          this.metrics?.recordDeliveryRecovery('ERROR');
          this.logger.error(
            `Stale delivery recovery failed for ${delivery.id}`,
            error instanceof Error ? error.stack : error,
          );
        }
      }

      this.logger.warn(
        `Stale delivery reconciliation: candidates=${candidates.length}, ` +
          `recovered=${recovered}, terminal=${terminal}, skipped=${skipped}`,
      );
    } catch (error) {
      this.logger.error(
        'Unexpected stale delivery recovery error',
        error instanceof Error ? error.stack : error,
      );
    } finally {
      this.isRunning = false;
    }
  }
}

function readBoundedInteger(
  rawValue: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = Number(rawValue);
  return Number.isFinite(value)
    ? Math.max(minimum, Math.min(Math.floor(value), maximum))
    : fallback;
}
