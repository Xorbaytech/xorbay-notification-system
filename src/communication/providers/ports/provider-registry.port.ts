import { ProviderDispatchPort } from '../../common/interfaces/provider-dispatch.port';

export const PROVIDER_REGISTRY = Symbol('PROVIDER_REGISTRY');

export interface ProviderRoute {
  channel: string;
  provider: string;
}

export interface ProviderRegistryPort {
  resolve(route: ProviderRoute): ProviderDispatchPort;
}
