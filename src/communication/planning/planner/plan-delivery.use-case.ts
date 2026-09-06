import {
  DeliveryPlanningContext,
  DeliveryPlanningPort,
} from './delivery-planning.port';

export const PLAN_DELIVERY_USE_CASE = Symbol('PLAN_DELIVERY_USE_CASE');

export interface PlanDeliveryCommand extends DeliveryPlanningContext {}

export class PlanDeliveryUseCase {
  constructor(private readonly deliveryPlanner: DeliveryPlanningPort) {}

  async execute(command: PlanDeliveryCommand) {
    return this.deliveryPlanner.plan(command);
  }
}
