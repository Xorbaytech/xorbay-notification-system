/**
 * Fallback channel cascade per SPEC-009 §6 (max 1 automatic fallback).
 *
 * EMAIL → SMS → PUSH
 *
 * Architecture rules:
 * - Fallback = same Communication + new Delivery (never same Delivery)
 * - Maximum 1 automatic fallback per logical delivery chain
 * - Channel cascade is EMAIL→SMS→PUSH only
 * - No fallback if the current channel is already the last in cascade
 */

// Frozen MVP fallback order from SPEC-009: EMAIL → SMS → PUSH.
// WhatsApp is an optional direct channel, not part of the automatic fallback
// cascade until a provider-specific policy explicitly enables it.
export const FALLBACK_CASCADE: readonly string[] = ['EMAIL', 'SMS', 'PUSH'];

export interface FallbackDecision {
  readonly shouldFallback: boolean;
  readonly nextChannel: string | null;
  readonly reason: string;
}

/**
 * EvaluateFallbackUseCase — determines whether a fallback delivery should
 * be created under the same Communication.
 *
 * This use case does NOT create the new Delivery — it only advises.
 * The orchestrating layer (dispatcher/recovery) is responsible for
 * persisting the new Delivery + QueuePublication.
 */
export class EvaluateFallbackUseCase {
  evaluate(params: {
    /** Channel of the failed delivery (e.g. 'EMAIL'). */
    failedChannel: string;
    /** How many fallback deliveries have already been attempted in this delivery chain. */
    existingFallbackCount: number;
  }): FallbackDecision {
    const currentIndex = FALLBACK_CASCADE.indexOf(params.failedChannel.toUpperCase());

    if (currentIndex === -1) {
      return {
        shouldFallback: false,
        nextChannel: null,
        reason: `Unknown channel '${params.failedChannel}'; cannot determine fallback channel.`,
      };
    }

    // SPEC-009: maximum 1 automatic fallback. This check is intentionally
    // after channel validation so non-cascading channels (for example the
    // mandatory IN_APP channel) receive a truthful terminal reason instead of
    // a misleading fallback-limit error.
    if (params.existingFallbackCount >= 1) {
      return {
        shouldFallback: false,
        nextChannel: null,
        reason: `Fallback limit reached (${params.existingFallbackCount} existing fallback(s)); no further automatic fallback.`,
      };
    }

    const nextIndex = currentIndex + 1;

    if (nextIndex >= FALLBACK_CASCADE.length) {
      return {
        shouldFallback: false,
        nextChannel: null,
        reason: `Channel '${params.failedChannel}' is the last in the fallback cascade; no further channel available.`,
      };
    }

    const nextChannel = FALLBACK_CASCADE[nextIndex];

    return {
      shouldFallback: true,
      nextChannel,
      reason: `Fallback from '${params.failedChannel}' to '${nextChannel}'.`,
    };
  }
}
