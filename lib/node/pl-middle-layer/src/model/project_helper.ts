import type { BlockConfig, PlRef } from '@platforma-sdk/model';
import { LRUCache } from 'lru-cache';
import type { QuickJSWASMModule } from 'quickjs-emscripten';
import { executeSingleLambda } from '../js_render';
import type { ResourceId } from '@milaboratories/pl-client';

type EnrichmentTargetsRequest = {
  blockConfig: () => BlockConfig;
  args: () => unknown;
};

type EnrichmentTargetsValue = {
  value: PlRef[] | undefined;
};

export class ProjectHelper {
  private readonly enrichmentTargetsCache = new LRUCache<string, EnrichmentTargetsValue, EnrichmentTargetsRequest>({
    max: 256,
    memoMethod: (_key, _value, { context }) => {
      return { value: this.calculateEnrichmentTargets(context) };
    },
  });

  constructor(private readonly quickJs: QuickJSWASMModule) {}

  private calculateEnrichmentTargets(req: EnrichmentTargetsRequest): PlRef[] | undefined {
    const blockConfig = req.blockConfig();
    console.log('AAAAAA', blockConfig.enrichmentTargets);
    if (blockConfig.enrichmentTargets === undefined) return undefined;
    const args = req.args();
    const result = executeSingleLambda(this.quickJs, blockConfig.enrichmentTargets, blockConfig.code!, args) as PlRef[];
    console.log('calculateEnrichmentTargets', result);
    return result;
  }

  public getEnrichmentTargets(blockConfig: () => BlockConfig, args: () => unknown, key?: { argsRid: ResourceId; blockPackRid: ResourceId }): PlRef[] | undefined {
    const req = { blockConfig, args };
    if (key === undefined)
      return this.calculateEnrichmentTargets(req);
    const cacheKey = `${key.argsRid}:${key.blockPackRid}`;
    return this.enrichmentTargetsCache.memo(cacheKey, { context: req }).value;
  }
}
