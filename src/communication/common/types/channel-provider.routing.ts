/**
 * Single source of truth for the DEFAULT provider route per channel.
 *
 * Adding a channel = register its adapter in ProviderModule and add one entry
 * here — no changes to the outbox processor, broadcast or direct use-cases
 * (they all resolve through defaultProviderFor).
 */
export const DEFAULT_PROVIDER_BY_CHANNEL: Readonly<Record<string, string>> = {
  EMAIL: 'FAKE_EMAIL',
  SMS: 'FAKE_SMS',
  PUSH: 'FAKE_PUSH',
  WHATSAPP: 'FAKE_WHATSAPP',
  IN_APP: 'ERP_IN_APP',
};

/** Default provider route for a channel, or null when the channel is unknown. */
export function defaultProviderFor(channel: string): string | null {
  return DEFAULT_PROVIDER_BY_CHANNEL[channel] ?? null;
}

/** Best-effort recipient address for a channel from an optional profile. */
export function recipientAddressFor(
  channel: string,
  recipientId: string,
  profile?: Record<string, unknown> | null,
): string {
  if (profile) {
    if (channel === 'EMAIL' && typeof profile.email === 'string' && profile.email) {
      return profile.email;
    }
    if (
      (channel === 'SMS' || channel === 'WHATSAPP') &&
      typeof profile.phone === 'string' &&
      profile.phone
    ) {
      return profile.phone;
    }
    if (channel === 'IN_APP' && typeof profile.userId === 'string' && profile.userId) {
      return profile.userId;
    }
  }
  return recipientId;
}
