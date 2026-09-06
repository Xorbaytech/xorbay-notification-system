import { FakeProviderAdapter, FakeProviderConfig } from './fake-provider.adapter';

/** Local/test WhatsApp transport. Stores a visible provider attempt without
 * requiring a Business API credential; production can still select ERP_WHATSAPP. */
export class FakeWhatsappProvider extends FakeProviderAdapter {
  constructor(config: FakeProviderConfig = {}) {
    super('FAKE_WHATSAPP', config);
  }
}
