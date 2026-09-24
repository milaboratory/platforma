import {
  isGlobalPObjectKey,
  isLocalPObjectKey,
  parseJsonSafely,
  PColumn,
  type ColumnEntriesProvider,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx, PColumnDataUniversal } from "../../render/internal";
import { getCfgRenderCtx } from "../../internal";
import { MainAccessorName, StagingAccessorName } from "../../render/internal";
import { TreeNodeAccessor } from "../../render/accessor";
import { DataColumnRecipe } from "../data_column";
import type { ColumnsSource } from "./types";
import { ArrayColumnsProvider, ColumnsProvider } from "./providers";

export * from "./types";
export * from "./providers";

/**
 * Build the default set of ColumnsProviders for the ambient render ctx:
 *  - `AccessorColumnsProvider` over `outputs` (if present)
 *  - `AccessorColumnsProvider` over `prerun`  (if present)
 *  - `ResultPoolColumnsProvider` over `rawResultPool`
 *
 * Pulls handles directly from the ambient `cfgRenderCtx`. Returns `[]` when
 * called outside a render context.
 *
 * With `id`, returns only the provider of the source that id belongs to: a
 * global id lives in the result pool, a local id under the accessor named by
 * the first element of its `resolvePath`. A lookup by id therefore never
 * touches another source, so a broken staging output does not fail a
 * result-pool id. An id of any other shape gets the full set.
 *
 * Result is memoised per-ctx, per source. Repeated calls within the
 * same render cycle return the same providers — inner providers are
 * also LRU-memoised by their content keys, so even a cache miss here doesn't
 * re-walk the trees.
 */
export const _ctxProvidersCache = new WeakMap<GlobalCfgRenderCtx, CtxProvider[]>();

export function getCtxProviders(deps?: {
  ctx?: GlobalCfgRenderCtx;
  id?: PObjectId;
}): CtxProvider[] {
  const ctx = deps?.ctx ?? getCfgRenderCtx();

  const cached = _ctxProvidersCache.get(ctx);
  if (cached !== undefined) return cached;

  const source = deps?.id === undefined ? undefined : sourceOfId(deps.id);
  if (source !== undefined) return ctxSourceProviders(ctx, source);

  const providers = CTX_SOURCES.flatMap((s) => ctxSourceProviders(ctx, s));
  _ctxProvidersCache.set(ctx, providers);
  return providers;
}

export function isColumnProvider(source: unknown): source is ColumnsProvider {
  if (typeof source !== "object" || source === null) return false;
  const p = source as ColumnsProvider;
  return typeof p.getColumns === "function" && typeof p.isFinal === "function";
}

export function toColumnProvider(source: ColumnsSource): ColumnsProvider {
  if (isColumnArray(source)) return new ArrayColumnsProvider(source.columns, source.isFinal);
  if (isColumnProvider(source)) return source;
  if (source instanceof TreeNodeAccessor) return ColumnsProvider(source);
  throw new Error("Unknown ColumnsSource type");
}

//
// Internals
//

type CtxProvider = ColumnEntriesProvider<TreeNodeAccessor> & ColumnsProvider;

type CtxSource = typeof MainAccessorName | typeof StagingAccessorName | "result_pool";

/** Precedence of the default provider set: outputs, then prerun, then the result pool. */
const CTX_SOURCES: ReadonlyArray<CtxSource> = [
  MainAccessorName,
  StagingAccessorName,
  "result_pool",
];

const _ctxSourceCache = new WeakMap<GlobalCfgRenderCtx, Map<CtxSource, CtxProvider[]>>();

/** Providers of one ctx source, memoised per ctx. An absent accessor yields none. */
function ctxSourceProviders(ctx: GlobalCfgRenderCtx, source: CtxSource): CtxProvider[] {
  let bySource = _ctxSourceCache.get(ctx);
  if (bySource === undefined) _ctxSourceCache.set(ctx, (bySource = new Map()));
  const cached = bySource.get(source);
  if (cached !== undefined) return cached;

  const providers = buildCtxSourceProviders(ctx, source);
  bySource.set(source, providers);
  return providers;
}

function buildCtxSourceProviders(ctx: GlobalCfgRenderCtx, source: CtxSource): CtxProvider[] {
  if (source === "result_pool") return [ColumnsProvider(ctx.getUpstreamBlockCtx())];
  const handle = ctx.getAccessorHandleByName(source);
  if (handle === undefined) return [];
  return [ColumnsProvider(new TreeNodeAccessor(handle, [source]))];
}

/** The ctx source an id can only be found in, or `undefined` when its shape names none. */
function sourceOfId(id: PObjectId): CtxSource | undefined {
  const key: unknown = parseJsonSafely(id);
  if (isGlobalPObjectKey(key)) return "result_pool";
  if (!isLocalPObjectKey(key)) return undefined;
  const root = key.resolvePath[0];
  if (root === MainAccessorName || root === StagingAccessorName) return root;
  return undefined;
}

function isColumnArray(source: unknown): source is {
  readonly columns: ReadonlyArray<
    PColumn<undefined | PColumnDataUniversal> | DataColumnRecipe<PObjectId>
  >;
  readonly isFinal: boolean;
} {
  if (typeof source !== "object" || source === null) return false;
  const s = source as { columns?: unknown; isFinal?: unknown };
  return Array.isArray(s.columns) && typeof s.isFinal === "boolean";
}
