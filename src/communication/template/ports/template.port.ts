export const TEMPLATE_RESOLUTION = Symbol('TEMPLATE_RESOLUTION');

export interface TemplateResolutionContext {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  sourceEventId: string;
  correlationId: string;
  event: unknown;
  policyDecision: unknown;
  recipients: readonly unknown[];
  preferences: readonly unknown[];
  templateIdentity?: unknown;
  templateVersion?: unknown;
}

export interface TemplateResolutionResult {
  renderedContent: unknown;
  context?: unknown;
}

export interface TemplatePort {
  resolve(context: TemplateResolutionContext): Promise<TemplateResolutionResult>;
}
