import { PColumn, type ColumnEntriesProvider } from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx, PColumnDataUniversal } from "../../render/internal";
import { getCfgRenderCtx } from "../../internal";
import { MainAccessorName, StagingAccessorName } from "../../render/internal";
import { TreeNodeAccessor } from "../../render/accessor";
import { ColumnLazy } from "../column_lazy";
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
 * Result is memoised per-ctx (WeakMap → array). Repeated calls within the
 * same render cycle return the same provider triplet — inner providers are
 * also LRU-memoised by their content keys, so even a cache miss here doesn't
 * re-walk the trees.
 */
export const _ctxProvidersCache = new WeakMap<
  GlobalCfgRenderCtx,
  (ColumnEntriesProvider<TreeNodeAccessor> & ColumnsProvider)[]
>();

export function getCtxProviders(deps?: {
  ctx?: GlobalCfgRenderCtx;
}): (ColumnEntriesProvider<TreeNodeAccessor> & ColumnsProvider)[] {
  const ctx = deps?.ctx ?? getCfgRenderCtx();

  const cached = _ctxProvidersCache.get(ctx);
  if (cached !== undefined) return cached;

  const providers: (ColumnEntriesProvider<TreeNodeAccessor> & ColumnsProvider)[] = [];

  const outputs = ctx.getAccessorHandleByName(MainAccessorName);
  if (outputs !== undefined) {
    providers.push(ColumnsProvider(new TreeNodeAccessor(outputs, [MainAccessorName])));
  }

  const prerun = ctx.getAccessorHandleByName(StagingAccessorName);
  if (prerun !== undefined) {
    providers.push(ColumnsProvider(new TreeNodeAccessor(prerun, [StagingAccessorName])));
  }

  providers.push(ColumnsProvider(ctx.getUpstreamBlockCtx()));

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

function isColumnArray(source: unknown): source is {
  readonly columns: ReadonlyArray<PColumn<undefined | PColumnDataUniversal> | ColumnLazy>;
  readonly isFinal: boolean;
} {
  if (typeof source !== "object" || source === null) return false;
  const s = source as { columns?: unknown; isFinal?: unknown };
  return Array.isArray(s.columns) && typeof s.isFinal === "boolean";
}
