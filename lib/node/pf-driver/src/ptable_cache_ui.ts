import type { PFrameHandle, PTableHandle } from '@platforma-sdk/model';
import type { PFrameInternal } from '@milaboratories/pl-model-middle-layer';
import type { PoolEntry } from '@milaboratories/ts-helpers';
import { LRUCache } from 'lru-cache';
import { logPFrames } from './logging';
import type { PTableHolder } from './ptable_pool';

export type PTableCacheUiOps = {
  /** Maximum number of `calculateTableData` results cached for each PFrame */
  pFrameCacheMaxCount: number;
  /**
   * Maximum size of `calculateTableData` results cached for PFrames overall.
   * The limit is soft, as the same table could be materialized with other requests and will not be deleted in such case.
   * Also each table has predeccessors, overlapping predecessors will be counted twice, so the effective limit is smaller.
   */
  pFramesCacheMaxSize: number;
};

export const PTableCacheUiOpsDefaults: PTableCacheUiOps = {
  pFrameCacheMaxCount: 18, // SHM trees create 3 PTables per graphic, we want to cache 6 graphics per PFrame
  pFramesCacheMaxSize: 8 * 1024 * 1024 * 1024, // 8 GB, same as blob driver cache (must be at least 2GB)
};

export class PTableCacheUi {
  private readonly perFrame = new Map<PFrameHandle, LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>>();
  private readonly global: LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>;
  private readonly disposeListeners = new Set<PTableHandle>();

  constructor(
    private readonly logger: PFrameInternal.Logger,
    private readonly ops: PTableCacheUiOps,
  ) {
    this.global = new LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>({
      maxSize: this.ops.pFramesCacheMaxSize,
      dispose: (resource, key, reason) => {
        if (reason === 'evict') {
          this.perFrame.get(resource.resource.pFrame)?.delete(key);
        }

        if (this.perFrame.get(resource.resource.pFrame)?.size === 0) {
          this.perFrame.delete(resource.resource.pFrame);
        }

        resource.unref();
        if (logPFrames()) {
          logger('info', `calculateTableData cache - removed PTable ${key} (reason: ${reason})`);
        }
      },
    });
  }

  public cache(resource: PoolEntry<PTableHandle, PTableHolder>, size: number): void {
    const key = resource.key;
    if (logPFrames()) {
      this.logger('info', `calculateTableData cache - added PTable ${key} with size ${size}`);
    }

    this.global.set(key, resource, { size: Math.max(size, 1) }); // 1 is minimum size to avoid cache evictions

    let perFrame = this.perFrame.get(resource.resource.pFrame);
    if (!perFrame) {
      perFrame = new LRUCache<PTableHandle, PoolEntry<PTableHandle, PTableHolder>>({
        max: this.ops.pFrameCacheMaxCount,
        dispose: (_resource, key, reason) => {
          if (reason === 'evict') {
            this.global.delete(key);
          }
        },
      });
      this.perFrame.set(resource.resource.pFrame, perFrame);
    }
    perFrame.set(key, resource);

    if (!this.disposeListeners.has(key)) {
      const disposeListener = () => {
        this.perFrame.get(resource.resource.pFrame)?.delete(key);
        this.global.delete(key);

        this.disposeListeners.delete(key);
        resource.resource.disposeSignal.removeEventListener('abort', disposeListener);
      };
      this.disposeListeners.add(key);
      resource.resource.disposeSignal.addEventListener('abort', disposeListener);
    }
  }
}
