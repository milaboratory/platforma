import type { PColumnSpec, PlRef, PObjectId } from "@milaboratories/pl-model-common";
import { createDiscoveredPColumnId, isPlRef } from "@milaboratories/pl-model-common";
import type { RenderCtxBase } from "../../../render";
import type {
  ColumnSource,
  ColumnMatch,
  RelaxedColumnSelector,
  ColumnSnapshotProvider,
  ColumnSnapshot,
} from "../../../columns";
import { ColumnCollectionBuilder } from "../../../columns";
import { toColumnSnapshotProvider } from "../../../columns/column_snapshot_provider";
import { collectCtxColumnSnapshotProviders } from "../../../columns/ctx_column_sources";
import { throwError } from "@milaboratories/helpers";
import type { ColumnsSelectorConfig, TableColumnSnapshot } from "./createPlDataTableV3";
import { isNil } from "es-toolkit";

export type DiscoverTableColumnOptions = {
  sources?: ColumnSource[];
  anchors: Record<string, PlRef | PObjectId | PColumnSpec | RelaxedColumnSelector>;
  selector: ColumnsSelectorConfig;
};

/** Discover columns from sources/anchors and normalize into a flat DiscoveredColumn list. */
export function discoverTableColumnSnaphots(
  ctx: RenderCtxBase,
  options: DiscoverTableColumnOptions,
): TableColumnSnapshot[] | undefined {
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
    const columns = collection.findColumns({
      ...(resolvedOptions.selector ?? {}),
      exclude: [
        ...(Array.isArray(resolvedOptions.selector?.exclude)
          ? resolvedOptions.selector.exclude
          : !isNil(resolvedOptions.selector.exclude)
            ? [resolvedOptions.selector.exclude]
            : []),
        { name: "pl7.app/label" },
      ],
    });
    const anchors = collection.getAnchors();
    return mapToDiscoveredColumns(columns, anchors);
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
  anchors: Map<string, ColumnSnapshot<PObjectId>>,
): TableColumnSnapshot[] {
  const columnIdToAnchorName = new Map<PObjectId, string>(
    Array.from(anchors.entries(), ([key, { id }]) => [id, key] as const),
  );

  return matched.flatMap((match) => {
    const snap = match.column;
    const isPrimary = columnIdToAnchorName.get(match.column.id) !== undefined;

    return match.variants.map((variant): TableColumnSnapshot => {
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
        id: discoveredId,
        isPrimary,

        originalId: snap.id,
        spec: snap.spec,
        data: snap.data,
        dataStatus: snap.dataStatus,

        linkerPath: variant.path,
        qualifications: variant.qualifications,
        distinctiveQualifications: variant.distinctiveQualifications,
      };
    });
  });
}
