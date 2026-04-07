export interface PoolEntry<K extends string = string, R extends {} = {}> extends Disposable {
  /** Resource key, calculated using provided `calculateParamsKey` function */
  readonly key: K;

  /** Resource itself created by `createNewResource` function */
  readonly resource: R;

  /**
   * Release the reference. Idempotent.
   * Same as `[Symbol.dispose]()` — provided as a named function
   * for use in callbacks (e.g. `addOnDestroy(entry.unref)`).
   */
  readonly unref: () => void;
}

/**
 * Wraps a PoolEntry for use with `using`. Auto-calls `unref()` at end of scope
 * unless `keep()` is called to transfer ownership to the caller.
 */
export class PoolEntryGuard<K extends string = string, R extends {} = {}> implements Disposable {
  private kept = false;

  constructor(readonly entry: PoolEntry<K, R>) {}

  get key(): K {
    return this.entry.key;
  }

  get resource(): R {
    return this.entry.resource;
  }

  /** Disarm the guard — caller takes ownership of the entry. */
  keep(): PoolEntry<K, R> {
    this.kept = true;
    return this.entry;
  }

  [Symbol.dispose](): void {
    if (!this.kept) this.entry.unref();
  }
}
