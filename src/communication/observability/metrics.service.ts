import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge } from 'prom-client';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('communication_events_ingested_total')
    public readonly eventsIngestedCounter: Counter<string>,
    @InjectMetric('communication_deliveries_total')
    public readonly deliveriesCounter: Counter<string>,
    @InjectMetric('communication_delivery_recoveries_total')
    public readonly deliveryRecoveriesCounter: Counter<string>,
    @InjectMetric('communication_outbox_queue_depth')
    public readonly outboxQueueDepthGauge: Gauge<string>,
  ) {}

  recordEventIngested(tenant: string, moduleName: string, status: 'ACCEPTED' | 'REJECTED') {
    this.eventsIngestedCounter.labels(tenant, moduleName, status).inc();
  }

  recordDeliveryOutcome(tenant: string, channel: string, provider: string, outcome: 'DELIVERED' | 'FAILED' | 'REJECTED') {
    this.deliveriesCounter.labels(tenant, channel, provider, outcome).inc();
  }

  recordDeliveryRecovery(outcome: 'RETRY' | 'TERMINAL' | 'SKIPPED' | 'ERROR') {
    this.deliveryRecoveriesCounter.labels(outcome).inc();
  }

  setOutboxQueueDepth(depth: number) {
    this.outboxQueueDepthGauge.set(depth);
  }
}
