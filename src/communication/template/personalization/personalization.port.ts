export const PERSONALIZATION = Symbol('PERSONALIZATION');

export interface PersonalizationContext {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  sourceEventId: string;
  correlationId: string;
  renderedContent: unknown;
  recipient: unknown;
}

export interface PersonalizationResult {
  finalizedContent: unknown;
}

export interface PersonalizationPort {
  personalize(context: PersonalizationContext): Promise<PersonalizationResult>;
}
