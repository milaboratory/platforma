import type {
  PColumnIdAndSpec,
  PColumnSpec,
  PlRef,
  PObjectId,
  SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import { isPlRef } from "@milaboratories/pl-model-common";
import type { RenderCtxBase } from "../../../render";
import type {
  ColumnSource,
  ColumnMatch,
  RelaxedColumnSelector,
  ColumnSnapshotProvider,
} from "../../../columns";
import { ColumnCollectionBuilder } from "../../../columns";
import { toColumnSnapshotProvider } from "../../../columns/column_snapshot_provider";
import { collectCtxColumnSnapshotProviders } from "../../../columns/ctx_column_sources";
import { throwError } from "@milaboratories/helpers";
import type { ColumnsSelectorConfig, TableColumnSnapshot } from "./createPlDataTableV3";

export type DiscoverTableColumnOptions = {
  sources?: ColumnSource[];
  anchors: Record<string, PlRef | PObjectId | PColumnSpec | RelaxedColumnSelector>;
  selector: ColumnsSelectorConfig;
};

/** Discover columns from sources/anchors and normalize into a flat DiscoveredColumn list. */
export function discoverTableColumnSnaphots(
  ctx: RenderCtxBase,
  options: DiscoverTableColumnOptions,
): TableColumnSnapshot<SUniversalPColumnId>[] | undefined {
  // Resolve PlRef anchors to PColumnSpec
  const resolvedOptions = {
    ...options,
    anchors: resolveAnchors(ctx, options.anchors),
  };

  // Resolve providers
  const providers = resolveProviders(ctx, resolvedOptions.sources);
  if (providers.length === 0) return undefined;

  // Build collection (anchored or plain)
  const collection = new ColumnCollectionBuilder(ctx.getService("pframeSpec"))
    .addSources(providers)
    .build(resolvedOptions);
  if (collection === undefined) return undefined;

  try {
    const matched = collection.findColumns(resolvedOptions.selector ?? undefined);
    const anchors = collection.getAnchors();
    return mapToDiscoveredColumns(matched, anchors);
  } finally {
    collection.dispose();
  }
}

// --- Pure helper functions ---

/** Resolve PlRef values in anchors to PColumnSpec via the result pool. */
function resolveAnchors(
  ctx: RenderCtxBase,
  anchors: Record<string, PlRef | PObjectId | PColumnSpec | RelaxedColumnSelector>,
): Record<string, PObjectId | PColumnSpec | RelaxedColumnSelector> {
  const result: Record<string, PObjectId | PColumnSpec | RelaxedColumnSelector> = {};
  for (const [key, value] of Object.entries(anchors)) {
    if (isPlRef(value)) {
      result[key] =
        ctx.resultPool.getPColumnSpecByRef(value) ??
        throwError(
          `Anchor ${key} with ref ${JSON.stringify(value)} could not be resolved to a PColumnSpec`,
        );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Resolve column snapshot providers from explicit sources or context. */
function resolveProviders(
  ctx: RenderCtxBase,
  sources: undefined | ColumnSource[],
): ColumnSnapshotProvider[] {
  return sources !== undefined
    ? sources.map(toColumnSnapshotProvider)
    : collectCtxColumnSnapshotProviders(ctx);
}

/** Map matched columns into a flat DiscoveredColumn list with deduped IDs. */
function mapToDiscoveredColumns(
  matched: readonly ColumnMatch[],
  anchors: Map<string, PColumnIdAndSpec>,
): TableColumnSnapshot<SUniversalPColumnId>[] {
  const anchorKeyByColumnId = new Map<PObjectId, string>(
    Array.from(anchors.entries(), ([key, { columnId }]) => [columnId, key] as const),
  );

  return matched.flatMap((match) => {
    const snap = match.column;
    const multi = match.variants.length > 1;
    const anchorKey = anchorKeyByColumnId.get(match.originalId);
    const isPrimary = anchorKey !== undefined;

    return match.variants.map((variant, vi) => ({
      id: (multi ? `${snap.id}#q${vi}` : snap.id) as SUniversalPColumnId,
      originalId: match.originalId,
      spec: snap.spec,
      data: snap.data,
      dataStatus: snap.dataStatus,
      isPrimary,
      anchorKey,
      linkerPath: variant.path,
      qualifications: variant.qualifications,
    }));
  });
}
