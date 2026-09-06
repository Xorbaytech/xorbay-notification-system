export const EVENT_VALIDATOR = Symbol('EVENT_VALIDATOR');

export interface EventValidatorPort {
  validate(event: unknown): void | Promise<void>;
}
