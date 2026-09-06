import {
  PersonalizationContext,
  PersonalizationPort,
} from './personalization.port';

export const PERSONALIZE_CONTENT_USE_CASE = Symbol('PERSONALIZE_CONTENT_USE_CASE');

export interface PersonalizeContentCommand extends PersonalizationContext {}

export class PersonalizeContentUseCase {
  constructor(private readonly personalization: PersonalizationPort) {}

  async execute(command: PersonalizeContentCommand) {
    const result = await this.personalization.personalize(command);

    return Object.freeze({
      finalizedContent: result.finalizedContent,
    });
  }
}
