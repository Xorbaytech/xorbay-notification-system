import { ProviderDispatchPort } from '../../common/interfaces/provider-dispatch.port';
import { ProviderRegistryPort, ProviderRoute } from '../ports/provider-registry.port';

export class ProviderRegistry implements ProviderRegistryPort {
  private readonly adapters = new Map<string, ProviderDispatchPort>();

  constructor(adapters: Array<{ route: ProviderRoute; adapter: ProviderDispatchPort }> = []) {
    for (const registration of adapters) {
      this.register(registration.route, registration.adapter);
    }
  }

  register(route: ProviderRoute, adapter: ProviderDispatchPort): void {
    const key = this.key(route);

    if (this.adapters.has(key)) {
      throw new Error(`Provider adapter already registered: ${key}`);
    }

    this.adapters.set(key, adapter);
  }

  resolve(route: ProviderRoute): ProviderDispatchPort {
    const key = this.key(route);
    const adapter = this.adapters.get(key);

    if (!adapter) {
      throw new Error(`No provider adapter registered for: ${key}`);
    }

    return adapter;
  }

  private key(route: ProviderRoute): string {
    return `${route.channel}:${route.provider}`;
  }
}
