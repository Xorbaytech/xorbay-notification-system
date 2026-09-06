import { DeliveryExecutionContext } from '../../common/interfaces/delivery-execution-context.port';
import {
  ProviderDeliveryResult,
  ProviderDispatchPort,
} from '../../common/interfaces/provider-dispatch.port';
import { Logger } from '@nestjs/common';

export interface FakeProviderConfig {
  readonly latencyMs?: number;
  readonly result?: Omit<ProviderDeliveryResult, 'occurredAt'>;
}

export abstract class FakeProviderAdapter implements ProviderDispatchPort {
  private readonly logger = new Logger(FakeProviderAdapter.name);

  protected constructor(
    private readonly providerName: string,
    private readonly config: FakeProviderConfig = {},
  ) {}

  async dispatch(context: DeliveryExecutionContext): Promise<ProviderDeliveryResult> {
    const latencyMs = this.config.latencyMs ?? 0;

    if (latencyMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, latencyMs));
    }

    this.logger.log(`[LOCAL MVP] Mocking dispatch of ${context.channel} to ${context.recipient} via ${this.providerName} for tenant ${context.tenantId}`);

    const configured = this.config.result;
    const outcome = configured?.outcome ?? 'ACCEPTED';

    return {
      outcome,
      providerMessageId:
        configured?.providerMessageId ?? `${this.providerName}:${context.deliveryId}:${context.attemptNumber}`,
      providerStatusReference: configured?.providerStatusReference ?? this.providerName,
      failureCategory: configured?.failureCategory ?? null,
      occurredAt: new Date(),
    };
  }
}
