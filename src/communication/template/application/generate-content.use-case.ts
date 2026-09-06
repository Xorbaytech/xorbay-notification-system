import {
  TemplatePort,
  TemplateResolutionContext,
} from '../ports/template.port';

export const GENERATE_CONTENT_USE_CASE = Symbol('GENERATE_CONTENT_USE_CASE');

export interface GenerateContentCommand extends TemplateResolutionContext {}

export class GenerateContentUseCase {
  constructor(private readonly templateResolver: TemplatePort) {}

  async execute(command: GenerateContentCommand) {
    return this.templateResolver.resolve(command);
  }
}
