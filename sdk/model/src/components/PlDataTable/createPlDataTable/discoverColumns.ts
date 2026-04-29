import type { PColumnSpec, PlRef, PObjectId } from "@milaboratories/pl-model-common";
import { createDiscoveredPColumnId, isPlRef } from "@milaboratories/pl-model-common";
import type { RenderCtxBase } from "../../../render";
import type {
  ColumnSource,
  ColumnVariant,
  RelaxedColumnSelector,
  ColumnSnapshotProvider,
  ColumnSnapshot,
} from "../../../columns";
import { ColumnCollectionBuilder } from "../../../columns";
import { toColumnSnapshotProvider } from "../../../columns/column_snapshot_provider";
import { collectCtxColumnSnapshotProviders } from "../../../columns/ctx_column_sources";
import { throwError } from "@milaboratories/helpers";
import type { ColumnsSelectorConfig, TableColumnVariant } from "./createPlDataTableV3";

export type DiscoverTableColumnOptions = {
  sources?: ColumnSource[];
  anchors: Record<string, PlRef | PObjectId | PColumnSpec | RelaxedColumnSelector>;
  selector: ColumnsSelectorConfig;
};

/** Discover columns from sources/anchors and normalize into a flat TableColumnVariant list. */
export function discoverTableColumnSnaphots(
  ctx: RenderCtxBase,
  options: DiscoverTableColumnOptions,
): TableColumnVariant[] | undefined {
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
    const variants = collection.findColumnVariants({
      ...(resolvedOptions.selector ?? {}),
    });
    const anchors = collection.getAnchors();
    return mapToTableColumnVariants(variants, anchors);
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

/** Map column variants into TableColumnVariant list with anchor-derived isPrimary flag. */
function mapToTableColumnVariants(
  variants: readonly ColumnVariant[],
  anchors: Map<string, ColumnSnapshot<PObjectId>>,
): TableColumnVariant[] {
  const columnIdToAnchorName = new Map<PObjectId, string>(
    Array.from(anchors.entries(), ([key, { id }]) => [id, key] as const),
  );

  return variants.map((variant): TableColumnVariant => {
    const snap = variant.column;
    const isPrimary = columnIdToAnchorName.get(snap.id) !== undefined;

    const discoveredId = createDiscoveredPColumnId({
      column: snap.id,
      path: variant.path.map((p) => ({
        type: "linker",
        column: p.linker.id,
        qualifications: p.qualifications,
      })),
      columnQualifications: variant.qualifications.forHit,
      queriesQualifications: variant.qualifications.forQueries,
    });
    return {
      column: {
        id: discoveredId,
        spec: snap.spec,
        data: snap.data,
        dataStatus: snap.dataStatus,
      },
      path: variant.path,
      qualifications: variant.qualifications,
      originalId: snap.id,
      isPrimary,
    };
  });
}
