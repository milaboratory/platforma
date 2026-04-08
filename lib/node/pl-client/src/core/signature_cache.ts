import { LRUCache } from "lru-cache";
import type { SignedResourceId } from "./types";

const DEFAULT_MAX_ENTRIES = 100_000;

/** Cross-transaction cache for resource signatures.
 * Keyed by resource ID (bigint), stores opaque signature bytes (Uint8Array).
 * Uses LRU eviction to prevent unbounded memory growth in long-running clients. */
export class SignatureCache {
  private readonly store: LRUCache<bigint, Uint8Array>;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.store = new LRUCache({ max: maxEntries });
  }

  set(id: bigint, sig: Uint8Array): void {
    this.store.set(id, sig);
  }

  get(id: bigint): Uint8Array | undefined {
    return this.store.get(id);
  }

  /** Return a SignedResourceId by looking up the cached signature. */
  sign(id: bigint): SignedResourceId {
    return { resourceId: id, resourceSignature: this.get(id) };
  }

  delete(id: bigint): boolean {
    return this.store.delete(id);
  }

  clear(): void {
    this.store.clear();
  }

  has(id: bigint): boolean {
    return this.store.has(id);
  }

  get size(): number {
    return this.store.size;
  }
}
