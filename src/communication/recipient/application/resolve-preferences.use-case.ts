import {
  PreferenceResolutionContext,
  PreferenceResolutionPort,
} from '../ports/preference-resolution.port';

export const PREFERENCE_RESOLUTION_USE_CASE = Symbol('PREFERENCE_RESOLUTION_USE_CASE');

export interface ResolvePreferencesCommand extends PreferenceResolutionContext {}

export class ResolvePreferencesUseCase {
  constructor(private readonly preferenceResolver: PreferenceResolutionPort) {}

  async execute(command: ResolvePreferencesCommand) {
    return this.preferenceResolver.resolve(command);
  }
}
