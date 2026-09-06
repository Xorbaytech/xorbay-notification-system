import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  SCHEDULED_PLAN_REPOSITORY,
  ScheduledPlanRepositoryPort,
} from '../../persistence/ports/scheduled-plan-repository.port';
import { ReleaseScheduledDeliveryUseCase } from '../../execution/dispatcher/release-scheduled-delivery.use-case';

@Injectable()
export class SchedulerCron {
  private readonly logger = new Logger(SchedulerCron.name);
  private isRunning = false;

  constructor(
    @Inject(SCHEDULED_PLAN_REPOSITORY)
    private readonly plans: ScheduledPlanRepositoryPort,
    private readonly releaseScheduledDelivery: ReleaseScheduledDeliveryUseCase,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    try {
      const now = new Date();
      
      // 1. Fetch due one-shot plans
      const oneShotPlans = await this.plans.findDueOneShotPlans(now);
      
      // 2. Fetch due recurring plans
      const recurringPlans = await this.plans.findDueRecurringPlans(now);
      
      const duePlans = [...oneShotPlans, ...recurringPlans];
      
      if (duePlans.length > 0) {
        this.logger.debug(`Found ${duePlans.length} due scheduled plans. Releasing...`);
        
        for (const plan of duePlans) {
          try {
            const result = await this.releaseScheduledDelivery.execute(plan, now);
            this.logger.debug(
              `ScheduledPlan ${plan.id} processed. Action: ${result.action}. Reason: ${result.reason}`,
            );
          } catch (error) {
            this.logger.error(
              `Failed to process ScheduledPlan ${plan.id}`,
              error instanceof Error ? error.stack : error,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error('Unexpected error in SchedulerCron', error instanceof Error ? error.stack : error);
    } finally {
      this.isRunning = false;
    }
  }
}
