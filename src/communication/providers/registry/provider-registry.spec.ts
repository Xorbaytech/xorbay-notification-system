import { ProviderDispatchPort } from '../../common/interfaces/provider-dispatch.port';
import { ProviderRegistry } from './provider-registry';

describe('ProviderRegistry', () => {
  const route = { channel: 'EMAIL', provider: 'SMTP' };
  const adapter: ProviderDispatchPort = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  };

  it('resolves the adapter registered for a route', () => {
    const registry = new ProviderRegistry([{ route, adapter }]);

    expect(registry.resolve(route)).toBe(adapter);
  });

  it('rejects duplicate route registration', () => {
    const registry = new ProviderRegistry([{ route, adapter }]);

    expect(() => registry.register(route, adapter)).toThrow(
      'Provider adapter already registered: EMAIL:SMTP',
    );
  });

  it('rejects an unresolved route', () => {
    const registry = new ProviderRegistry();

    expect(() => registry.resolve(route)).toThrow(
      'No provider adapter registered for: EMAIL:SMTP',
    );
  });
});
