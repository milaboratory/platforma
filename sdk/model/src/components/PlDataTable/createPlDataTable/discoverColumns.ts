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

/**
 * Configuration for the advanced `columns: { sources, anchors, selector }`
 * form of {@link createPlDataTableV3}. Use this when you need explicit control
 * over which providers participate in discovery (e.g. filtering the result
 * pool, adding extra workflow outputs) or when the anchor must be a specific
 * column rather than the default "every primary column" set used by
 * `primaryColumns` + `enrichFromPool`.
 */
export type DiscoverTableColumnOptions = {
  /**
   * Column sources to search. When omitted, discovery falls back to the
   * default ctx providers (`outputs → prerun → resultPool`, deduped by
   * `NativePObjectId` with first-source-wins).
   *
   * Order matters for dedup — sources earlier in the list take precedence
   * when multiple sources expose the same column (same `NativePObjectId`).
   */
  sources?: ColumnSource[];
  /**
   * Named anchors against which discovery resolves axes. Each entry can be:
   *  - `PlRef` — resolved against the result pool to a `PColumnSpec`.
   *  - `PObjectId` — looked up in the collected columns.
   *  - `PColumnSpec` — used directly (matched by `NativePObjectId`).
   *  - `RelaxedColumnSelector` — selector that must resolve to a unique column.
   *
   * Anchors define the join "frame" — discovery only returns columns whose
   * axes are reachable from at least one anchor (per the `selector.mode`).
   */
  anchors: Record<string, PlRef | PObjectId | PColumnSpec | RelaxedColumnSelector>;
  /** Selector configuration controlling which columns are discovered. */
  selector: ColumnsSelectorConfig;
};

/**
 * Discover columns from sources/anchors and normalize into a flat
 * `TableColumnVariant[]`. Used internally by {@link createPlDataTableV3}
 * when the user passes the advanced `columns: { ... }` form.
 *
 * Returns `undefined` when there are no sources, no collection could be built,
 * or no variants matched.
 */
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
