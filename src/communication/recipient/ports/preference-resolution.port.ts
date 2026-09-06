export const PREFERENCE_RESOLUTION = Symbol('PREFERENCE_RESOLUTION');

export interface PreferenceResolutionContext {
  tenantId: string;
  sourceModuleId: string;
  eventType: string;
  sourceEventId: string;
  correlationId: string;
  recipients: readonly unknown[];
  policyDecision: unknown;
}

export interface PreferenceResolutionResult {
  preferences: readonly unknown[];
  evidence?: readonly unknown[];
}

export interface PreferenceResolutionPort {
  resolve(context: PreferenceResolutionContext): Promise<PreferenceResolutionResult>;
}
