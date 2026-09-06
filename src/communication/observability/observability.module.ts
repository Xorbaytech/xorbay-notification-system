import { Module } from '@nestjs/common';
import { PrometheusModule, makeCounterProvider, makeGaugeProvider } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [
    MetricsService,
    makeCounterProvider({
      name: 'communication_events_ingested_total',
      help: 'Total number of events ingested',
      labelNames: ['tenant', 'module', 'status'],
    }),
    makeCounterProvider({
      name: 'communication_deliveries_total',
      help: 'Total number of delivery attempts',
      labelNames: ['tenant', 'channel', 'provider', 'outcome'],
    }),
    makeCounterProvider({
      name: 'communication_delivery_recoveries_total',
      help: 'Total number of stale delivery recovery decisions',
      labelNames: ['outcome'],
    }),
    makeGaugeProvider({
      name: 'communication_outbox_queue_depth',
      help: 'Number of pending jobs in the transactional outbox',
    }),
  ],
  exports: [MetricsService],
})
export class ObservabilityModule {}
