import { FakeProviderAdapter, FakeProviderConfig } from './fake-provider.adapter';

export class FakePushProvider extends FakeProviderAdapter {
  constructor(config: FakeProviderConfig = {}) {
    super('FAKE_PUSH', config);
  }
}
