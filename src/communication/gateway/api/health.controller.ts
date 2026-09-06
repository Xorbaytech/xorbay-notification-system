import { Controller, Get, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { QueueHealthService } from '../../infrastructure/bullmq/queue-health.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly queueHealth: QueueHealthService,
  ) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const queue = await this.queueHealth.check();
      if (queue.status !== 'CONNECTED') {
        return {
          status: 'DOWN',
          timestamp: new Date().toISOString(),
          database: 'CONNECTED',
          queue: queue.status,
          error: queue.error,
        };
      }
      return {
        status: 'UP',
        timestamp: new Date().toISOString(),
        database: 'CONNECTED',
        queue: queue.status,
      };
    } catch (error) {
      return {
        status: 'DOWN',
        timestamp: new Date().toISOString(),
        database: 'DISCONNECTED',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
