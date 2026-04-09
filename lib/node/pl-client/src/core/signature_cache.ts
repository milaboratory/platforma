import { LRUCache } from "lru-cache";
import type { ResourceId, ResourceSignature, SignedResourceId } from "./types";

const DEFAULT_MAX_ENTRIES = 100_000;

/** Cross-transaction cache for resource signatures.
 * Keyed by ResourceId, stores opaque ResourceSignature bytes.
 * Uses LRU eviction to prevent unbounded memory growth in long-running clients. */
export class SignatureCache {
  private readonly store: LRUCache<ResourceId, ResourceSignature>;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.store = new LRUCache({ max: maxEntries });
  }

  set(id: ResourceId, sig: ResourceSignature): void {
    this.store.set(id, sig);
  }

  get(id: ResourceId): ResourceSignature | undefined {
    return this.store.get(id);
  }

  /** Return a SignedResourceId by looking up the cached signature. */
  sign(id: ResourceId): SignedResourceId {
    return { resourceId: id, resourceSignature: this.get(id) };
  }

  delete(id: ResourceId): boolean {
    return this.store.delete(id);
  }

  clear(): void {
    this.store.clear();
  }

  has(id: ResourceId): boolean {
    return this.store.has(id);
  }

  get size(): number {
    return this.store.size;
  }
}
