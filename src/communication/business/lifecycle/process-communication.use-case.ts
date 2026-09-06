import { Inject, Injectable } from '@nestjs/common';
import { AUDIT, AuditPort } from '../../audit/ports/audit.port';
import {
  BUSINESS_SIGNIFICANCE,
  BusinessSignificanceContext,
  BusinessSignificanceDecision,
  BusinessSignificancePort,
} from '../significance/ports/business-significance.port';
import { POLICY, PolicyContext, PolicyPort, PolicyResult } from '../policy/ports/policy.port';
import {
  RECIPIENT_RESOLUTION,
  RecipientResolutionPort,
  RecipientResolutionResult,
} from '../../recipient/ports/recipient-resolution.port';
import {
  PREFERENCE_RESOLUTION,
  PreferenceResolutionPort,
  PreferenceResolutionResult,
} from '../../recipient/ports/preference-resolution.port';
import { TEMPLATE_RESOLUTION, TemplatePort, TemplateResolutionResult } from '../../template/ports/template.port';

export interface ProcessCommunicationResult {
  significance: {
    decision: BusinessSignificanceDecision;
    reason: string;
  };
  policy?: PolicyResult;
  recipients?: RecipientResolutionResult;
  preferences?: PreferenceResolutionResult;
  content?: TemplateResolutionResult;
}

@Injectable()
export class ProcessCommunicationUseCase {
  constructor(
    @Inject(BUSINESS_SIGNIFICANCE)
    private readonly businessSignificance: BusinessSignificancePort,
    @Inject(AUDIT)
    private readonly audit: AuditPort,
    @Inject(POLICY)
    private readonly policy: PolicyPort,
    @Inject(RECIPIENT_RESOLUTION)
    private readonly recipientResolution: RecipientResolutionPort,
    @Inject(PREFERENCE_RESOLUTION)
    private readonly preferenceResolution: PreferenceResolutionPort,
    @Inject(TEMPLATE_RESOLUTION)
    private readonly templateResolution: TemplatePort,
  ) {}

  async execute(context: BusinessSignificanceContext): Promise<ProcessCommunicationResult> {
    const significance = await this.businessSignificance.evaluate(context);

    await this.audit.recordBusinessSignificance({
      tenantId: context.tenantId,
      sourceModuleId: context.sourceModuleId,
      eventType: context.eventType,
      sourceEventId: context.sourceEventId,
      correlationId: context.correlationId,
      decision: significance.decision,
      reason: significance.reason,
    });

    if (significance.decision !== 'NOTIFY') {
      return { significance };
    }

    const policyContext: PolicyContext = {
      tenantId: context.tenantId,
      sourceModuleId: context.sourceModuleId,
      eventType: context.eventType,
      sourceEventId: context.sourceEventId,
      aggregateId: context.aggregateId,
      aggregateVersion: context.aggregateVersion,
      schemaVersion: context.schemaVersion,
      correlationId: context.correlationId,
      payload: context.payload,
    };

    const policy = await this.policy.evaluate(policyContext);

    if (policy.decision === 'SUPPRESSED') {
      return { significance, policy };
    }

    const recipients = await this.recipientResolution.resolve({
      tenantId: context.tenantId,
      sourceModuleId: context.sourceModuleId,
      eventType: context.eventType,
      sourceEventId: context.sourceEventId,
      correlationId: context.correlationId,
      event: context,
      policyDecision: policy,
    });

    if (recipients.recipients.length === 0) {
      return { significance, policy, recipients };
    }

    const preferences = await this.preferenceResolution.resolve({
      tenantId: context.tenantId,
      sourceModuleId: context.sourceModuleId,
      eventType: context.eventType,
      sourceEventId: context.sourceEventId,
      correlationId: context.correlationId,
      recipients: recipients.recipients,
      policyDecision: policy,
    });

    const content = await this.templateResolution.resolve({
      tenantId: context.tenantId,
      sourceModuleId: context.sourceModuleId,
      eventType: context.eventType,
      sourceEventId: context.sourceEventId,
      correlationId: context.correlationId,
      event: context,
      policyDecision: policy,
      recipients: recipients.recipients,
      preferences: preferences.preferences,
    });

    return { significance, policy, recipients, preferences, content };
  }
}
