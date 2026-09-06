import { FakeProviderAdapter, FakeProviderConfig } from './fake-provider.adapter';

export class FakeSmsProvider extends FakeProviderAdapter {
  constructor(config: FakeProviderConfig = {}) {
    super('FAKE_SMS', config);
  }
}
