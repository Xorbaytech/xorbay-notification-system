import {
  RecipientResolutionContext,
  RecipientResolutionPort,
} from '../ports/recipient-resolution.port';

export const RECIPIENT_RESOLUTION_USE_CASE = Symbol('RECIPIENT_RESOLUTION_USE_CASE');

export interface ResolveRecipientsCommand extends RecipientResolutionContext {}

export class ResolveRecipientsUseCase {
  constructor(private readonly recipientResolver: RecipientResolutionPort) {}

  async execute(command: ResolveRecipientsCommand) {
    return this.recipientResolver.resolve(command);
  }
}
