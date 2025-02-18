import { folderReaderByUrl, RegistryV2Reader } from '@platforma-sdk/block-tools';
import type { Dispatcher } from 'undici';

export class V2RegistryProvider {
  private readonly registries = new Map<string, RegistryV2Reader>();

  constructor(private readonly http: Dispatcher) {}

  public getRegistry(url: string): RegistryV2Reader {
    const fromCache = this.registries.get(url);
    if (fromCache) return fromCache;
    const newRegistry = new RegistryV2Reader(folderReaderByUrl(url, this.http));
    this.registries.set(url, newRegistry);
    return newRegistry;
  }
}
