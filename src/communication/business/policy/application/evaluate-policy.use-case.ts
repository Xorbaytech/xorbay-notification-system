import { Inject, Injectable } from '@nestjs/common';
import {
  POLICY,
  PolicyContext,
  PolicyPort,
  PolicyResult,
} from '../ports/policy.port';

@Injectable()
export class EvaluatePolicyUseCase {
  constructor(
    @Inject(POLICY)
    private readonly policy: PolicyPort,
  ) {}

  execute(context: PolicyContext): Promise<PolicyResult> {
    return this.policy.evaluate(context);
  }
}
