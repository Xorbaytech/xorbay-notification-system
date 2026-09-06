import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_SIGNIFICANCE,
  BusinessSignificanceContext,
  BusinessSignificancePort,
  BusinessSignificanceResult,
} from '../ports/business-significance.port';

@Injectable()
export class EvaluateBusinessSignificanceUseCase {
  constructor(
    @Inject(BUSINESS_SIGNIFICANCE)
    private readonly businessSignificance: BusinessSignificancePort,
  ) {}

  execute(context: BusinessSignificanceContext): Promise<BusinessSignificanceResult> {
    return this.businessSignificance.evaluate(context);
  }
}
