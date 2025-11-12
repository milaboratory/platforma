import type { PTableHandle } from '@platforma-sdk/model';
import type { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import type { PoolEntry } from '@milaboratories/ts-helpers';
import { LRUCache } from 'lru-cache';
import { logPFrames } from './logging';
import type { PTableHolder } from './ptable_pool';

export type PTableCacheModelOps = {
  /**
   * Maximum size of `createPTable` results cached on disk.
   * The limit is soft, as the same table could be materialized with other requests and will not be deleted in such case.
   * Also each table has predeccessors, overlapping predecessors will be counted twice, so the effective limit is smaller.
   */
  pTablesCacheMaxSize: number;
};

export const PTableCacheModelOpsDefaults: PTableCacheModelOps = {
  pTablesCacheMaxSize: 32 * 1024 * 1024 * 1024, // 32 GB (must be at least 8GB)
};

export class PTableCacheModel {
  private readonly global: LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>;
  private readonly disposeListeners = new Set<PTableHandle>();

  constructor(
    private readonly logger: PFrameInternal.Logger,
    ops: PTableCacheModelOps,
  ) {
    this.global = new LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>({
      maxSize: ops.pTablesCacheMaxSize,
      dispose: (resource, key, reason) => {
        resource.unref();
        if (logPFrames()) {
          logger('info', `createPTable cache - removed PTable ${key} (reason: ${reason})`);
        }
      },
    });
  }

  public cache(resource: PoolEntry<PTableHandle, PTableHolder>, size: number, defDisposeSignal: AbortSignal): void {
    const key = resource.key;
    if (logPFrames()) {
      this.logger('info', `createPTable cache - added PTable ${key} with size ${size}`);
    }

    const status: LRUCache.Status<PoolEntry<PTableHandle, PTableHolder>> = {};
    this.global.set(key, resource, { size: Math.max(size, 1), status }); // 1 is minimum size to avoid cache evictions

    if (status.maxEntrySizeExceeded) {
      resource.unref();
      if (logPFrames()) {
        this.logger('info', `createPTable cache - removed PTable ${key} (maxEntrySizeExceeded)`);
      }
    } else {
      if (!this.disposeListeners.has(key)) {
        const disposeListener = () => {
          this.global.delete(key);

          this.disposeListeners.delete(key);
          defDisposeSignal.removeEventListener('abort', disposeListener);
        };
        this.disposeListeners.add(key);
        defDisposeSignal.addEventListener('abort', disposeListener);
      }
    }
  }
}
