import {
  AccessorEntriesProvider,
  ResultPoolEntriesProvider,
  type PColumn,
  type UpstreamBlockCtx,
} from "@milaboratories/pl-model-common";
import { AccessorHandle, PColumnDataUniversal, TreeNodeAccessor } from "../../render";
import { ColumnLazy, ColumnLazyImpl } from "../column_lazy";
import { getCfgRenderCtx } from "../../internal";
import { isNil } from "es-toolkit";
import { LRUCache } from "lru-cache";

/**
 * Data source for sandbox column-list builders. Has nothing to say about
 * id-resolution — `ColumnRegistry` (in `@milaboratories/pl-model-common`)
 * consumes the separate `ColumnEntriesProvider` interface for that.
 *
 * Same name as the factory function below — they merge into one TS
 * declaration: `ColumnsProvider` is callable AND the interface type.
 */
export interface ColumnsProvider {
  /** Returns all currently known PColumn columns as lazy views. */
  getColumns(): ColumnLazy[];
  /** Whether the provider has finished enumerating all its columns. */
  isFinal(): boolean;
}

/**
 * Unified memoised factory dispatching to the right provider flavour by the
 * source shape:
 * - `TreeNodeAccessor` → {@link AccessorColumnsProvider}
 *   (indexed by `root.handle`, walks the accessor tree once per root).
 * - `UpstreamBlockCtx<AccessorHandle>[]` (or omitted — pulled from the
 *   ambient ctx) → {@link ResultPoolColumnsProvider}
 *   (indexed by a content-hash of the block list).
 *
 * Both branches return cached instances within their LRU window, so repeated
 * calls with the same source skip re-walking / re-hashing.
 */
export function ColumnsProvider(
  source?: TreeNodeAccessor | ReadonlyArray<UpstreamBlockCtx<AccessorHandle>>,
) {
  if (isNil(source) || Array.isArray(source)) {
    return ResultPoolColumnsProvider(source);
  } else if (source instanceof TreeNodeAccessor) {
    return AccessorColumnsProvider(source);
  } else {
    throw new Error("Unknown columns provider source");
  }
}

/**
 * Memoised constructor — same `root.handle` returns the same
 * {@link AccessorColumnsProviderImpl}, so `indexAccessorRoot` runs once per
 * accessor root (within the LRU window).
 */
const _accessorProviderCache = new LRUCache<AccessorHandle, AccessorColumnsProviderImpl>({
  max: 64,
});
export function AccessorColumnsProvider(root: TreeNodeAccessor): AccessorColumnsProvider {
  let provider = _accessorProviderCache.get(root.handle);
  if (provider === undefined) {
    provider = new AccessorColumnsProviderImpl(root);
    _accessorProviderCache.set(root.handle, provider);
  }
  return provider;
}

/**
 * Memoised constructor — same `rawPool` content returns the same
 * {@link ResultPoolColumnsProviderImpl}, so `indexPoolBlock` runs once per
 * pool snapshot (within the LRU window).
 */
const _resultPoolProviderCache = new LRUCache<string, ResultPoolColumnsProviderImpl>({ max: 4 });
export function ResultPoolColumnsProvider(
  rawPool: ReadonlyArray<
    UpstreamBlockCtx<AccessorHandle>
  > = getCfgRenderCtx().getUpstreamBlockCtx(),
): ResultPoolColumnsProvider {
  const key = hashRawPool(rawPool);
  let provider = _resultPoolProviderCache.get(key);
  if (provider === undefined) {
    provider = new ResultPoolColumnsProviderImpl(rawPool);
    _resultPoolProviderCache.set(key, provider);
  }
  return provider;
}

/**
 * Simple provider wrapping an array of PColumns. Sandbox-only —
 * implements {@link ColumnsProvider} (lazy-view enumeration). It is *not* an
 * id-index source — `ColumnRegistry` does not consume it.
 */
export class ArrayColumnsProvider implements ColumnsProvider {
  private readonly columns: ColumnLazy[];

  constructor(
    columns: ReadonlyArray<PColumn<undefined | PColumnDataUniversal> | ColumnLazy>,
    private readonly _isFinal: boolean,
  ) {
    this.columns = columns.map((c) => ColumnLazyImpl.fromColumn(c));
  }

  getColumns(): ColumnLazy[] {
    return this.columns;
  }

  isFinal(): boolean {
    return this._isFinal;
  }
}

/**
 * Sandbox-specific provider over a {@link TreeNodeAccessor} root. Uses the
 * accessor's own `resolvePath` as the canonical root path for id construction,
 * and adds `getColumns()` returning {@link ColumnLazy}s on top of the generic
 * entries index.
 */
export class AccessorColumnsProviderImpl
  extends AccessorEntriesProvider<TreeNodeAccessor>
  implements ColumnsProvider
{
  private cachedColumns?: ColumnLazy[];

  constructor(root: TreeNodeAccessor) {
    super(root, root.resolvePath);
  }

  getColumns(): ColumnLazy[] {
    if (this.cachedColumns !== undefined) return this.cachedColumns;
    return (this.cachedColumns = Array.from(this.entries.values())
      .map((e) => ColumnLazyImpl.fromAccessor(e))
      .filter((v): v is ColumnLazy => !isNil(v)));
  }
}

/** Public type alias — value of the same name is the memoised factory above. */
export type AccessorColumnsProvider = AccessorColumnsProviderImpl;

/**
 * Sandbox-specific result-pool provider. Accepts the raw handle-shaped blocks
 * returned by {@link GlobalCfgRenderCtxMethods.getUpstreamBlockCtx} and
 * wraps them into {@link TreeNodeAccessor}s, then adds `getColumns()`.
 */
export class ResultPoolColumnsProviderImpl
  extends ResultPoolEntriesProvider<TreeNodeAccessor>
  implements ColumnsProvider
{
  private cachedColumns?: ColumnLazy[];

  constructor(
    rawPool: ReadonlyArray<
      UpstreamBlockCtx<AccessorHandle>
    > = getCfgRenderCtx().getUpstreamBlockCtx(),
  ) {
    const blocks = rawPool.map((b) => ({
      blockId: b.blockId,
      prodCtx:
        b.prodCtx !== undefined
          ? new TreeNodeAccessor(b.prodCtx, [b.blockId, "prodCtx"])
          : undefined,
      stagingCtx:
        b.stagingCtx !== undefined
          ? new TreeNodeAccessor(b.stagingCtx, [b.blockId, "stagingCtx"])
          : undefined,
      prodIncomplete: b.prodIncomplete,
      stagingIncomplete: b.stagingIncomplete,
    }));

    super(blocks);
  }

  getColumns(): ColumnLazy[] {
    if (this.cachedColumns !== undefined) return this.cachedColumns;
    return (this.cachedColumns = Array.from(this.getPObjectEntries().values())
      .map((e) => ColumnLazyImpl.fromAccessor(e))
      .filter((v): v is ColumnLazy => !isNil(v)));
  }
}

/** Public type alias — value of the same name is the memoised factory above. */
export type ResultPoolColumnsProvider = ResultPoolColumnsProviderImpl;

function hashRawPool(rawPool: ReadonlyArray<UpstreamBlockCtx<AccessorHandle>>): string {
  return rawPool
    .map(
      (b) =>
        `${b.blockId}\x1f${b.prodCtx ?? ""}\x1f${b.stagingCtx ?? ""}\x1f${
          b.prodIncomplete ? 1 : 0
        }\x1f${b.stagingIncomplete ? 1 : 0}`,
    )
    .join("\x1e");
}
