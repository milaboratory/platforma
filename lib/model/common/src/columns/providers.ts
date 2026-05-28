import type { PObjectId } from "../pool";
import { indexAccessorRoot, indexPoolBlock } from "./accessor_traversal";
import type { AccessorLike, ColumnEntriesProvider, LeafEntry, UpstreamBlockCtx } from "./types";

/**
 * Generic entries provider over a single accessor root. Walks `<root>` once
 * from the supplied `rootPath`, builds an id → {@link LeafEntry} map and
 * exposes `isFinal()` via the root's `getInputsLocked()`.
 *
 * Used directly on the host side; sandbox extends it with `getColumns()`
 * returning {@link ColumnLazy}s — see `AccessorColumnsProvider` in
 * `@platforma-sdk/model`.
 */
export class AccessorEntriesProvider<
  A extends AccessorLike<A>,
> implements ColumnEntriesProvider<A> {
  protected readonly entries: ReadonlyMap<PObjectId, LeafEntry<A>>;

  constructor(
    protected readonly root: A,
    rootPath: ReadonlyArray<string>,
  ) {
    const map = new Map<PObjectId, LeafEntry<A>>();
    for (const entry of indexAccessorRoot(root, rootPath)) {
      if (!map.has(entry.id)) map.set(entry.id, entry);
    }
    this.entries = map;
  }

  getPObjectEntries(): ReadonlyMap<PObjectId, LeafEntry<A>> {
    return this.entries;
  }

  isFinal(): boolean {
    return this.root.getInputsLocked();
  }
}

/**
 * Generic entries provider over a list of upstream-block ctx pairs.
 *
 * Per-block merge: iterate `prod` then `staging`, dedupe by name with
 * first-wins semantics (prod takes precedence).
 *
 * `isFinal()` is the AND of `getInputsLocked()` over every present ctx
 * accessor and `!prodIncomplete && !stagingIncomplete` over every block.
 */
export class ResultPoolEntriesProvider<
  A extends AccessorLike<A>,
> implements ColumnEntriesProvider<A> {
  protected cachedEntries?: ReadonlyMap<PObjectId, LeafEntry<A>>;

  constructor(protected readonly blocks: ReadonlyArray<UpstreamBlockCtx<A>>) {}

  getPObjectEntries(): ReadonlyMap<PObjectId, LeafEntry<A>> {
    if (this.cachedEntries !== undefined) return this.cachedEntries;
    const map = new Map<PObjectId, LeafEntry<A>>();
    for (const block of this.blocks) {
      for (const entry of indexPoolBlock(block)) {
        if (!map.has(entry.id)) map.set(entry.id, entry);
      }
    }
    return (this.cachedEntries = map);
  }

  isFinal(): boolean {
    for (const block of this.blocks) {
      if (block.prodIncomplete || block.stagingIncomplete) return false;
      if (block.prodCtx && !block.prodCtx.getInputsLocked()) return false;
      if (block.stagingCtx && !block.stagingCtx.getInputsLocked()) return false;
    }
    return true;
  }
}
