import { FakeProviderAdapter, FakeProviderConfig } from './fake-provider.adapter';

export class FakeEmailProvider extends FakeProviderAdapter {
  constructor(config: FakeProviderConfig = {}) {
    super('FAKE_EMAIL', config);
  }
}
