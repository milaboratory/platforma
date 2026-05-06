import type { PColumnSpec, PlRef, PObjectId } from "@milaboratories/pl-model-common";
import { createDiscoveredPColumnId, isPlRef, PColumnName } from "@milaboratories/pl-model-common";
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
    const variants = collection.findColumnVariants(resolvedOptions.selector);
    const anchors = collection.getAnchors();
    return mapToTableColumnVariants(variants, anchors);
  } finally {
    collection.dispose();
  }
}

/**
 * Discover label columns matching the axes of the given value columns from
 * ctx providers. Returns label snapshots wrapped as direct TableColumnVariants
 * (path: [], empty qualifications, isPrimary: false).
 */
export function discoverLabelColumnVariants<A, U>(
  ctx: RenderCtxBase<A, U>,
  columns: TableColumnVariant[],
): TableColumnVariant[] {
  if (columns.length === 0) return [];
  const collection = new ColumnCollectionBuilder(ctx.getService("pframeSpec"))
    .addSources(collectCtxColumnSnapshotProviders(ctx))
    .addSource(columns.map((c) => c.column))
    .build({
      allowPartialColumnList: true,
      anchors: Object.fromEntries(
        columns
          .filter((col) => (col.path?.length ?? 0) === 0 && col.isPrimary)
          .map((col, i) => [`anchor_${i}`, col.column.spec]),
      ),
    });

  try {
    const axes = columns.flatMap((col) => col.column.spec.axesSpec);
    return collection
      .findColumnVariants({
        include: axes.map((a) => ({
          name: { type: "exact", value: PColumnName.Label },
          axes: [{ name: { type: "exact", value: a.name } }],
        })),
        maxHops: columns.reduce((acc, c) => Math.max(acc, c.path?.length ?? 0), 0),
      })
      .map((variant) => ({
        ...variant,
        column: {
          ...variant.column,
          id: createDiscoveredPColumnId({
            column: variant.column.id,
            path: variant.path?.map((p) => ({
              type: "linker",
              column: p.linker.id,
            })),
            columnQualifications: variant.qualifications?.forHit,
            queriesQualifications: variant.qualifications?.forQueries,
          }),
          originalId: variant.column.id,
        },
      }));
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
      path: variant.path?.map((p) => ({
        type: "linker",
        column: p.linker.id,
      })),
      columnQualifications: variant.qualifications?.forHit,
      queriesQualifications: variant.qualifications?.forQueries,
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
