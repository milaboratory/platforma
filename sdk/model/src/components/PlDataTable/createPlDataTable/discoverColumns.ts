import type {
  PColumnSpec,
  PlRef,
  PObjectId,
  RequireServices,
  Services,
  SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import { deriveNativeId, isPlRef } from "@milaboratories/pl-model-common";
import type { RenderCtxBase } from "../../../render";
import type { ColumnSource, ColumnMatch, RelaxedColumnSelector } from "../../../columns";
import { ColumnCollectionBuilder } from "../../../columns";
import { toColumnSnapshotProvider } from "../../../columns/column_snapshot_provider";
import { collectCtxColumnSnapshotProviders } from "../../../columns/ctx_column_sources";
import { throwError } from "@milaboratories/helpers";
import type { ColumnsSelectorConfig, DiscoveredColumn } from "./createPlDataTableV3";

export type DiscoveredColumnOptions = {
  sources?: ColumnSource[];
  anchors: Record<string, PlRef | PObjectId | PColumnSpec | RelaxedColumnSelector>;
  columnsSelector: ColumnsSelectorConfig;
};

/** Discover columns from sources/anchors and normalize into a flat DiscoveredColumn list. */
export function discoverColumns<A, U, S extends RequireServices<typeof Services.PFrameSpec>>(
  ctx: RenderCtxBase<A, U, S>,
  options: DiscoveredColumnOptions,
): DiscoveredColumn<SUniversalPColumnId>[] | undefined {
  // Resolve PlRef anchors to PColumnSpec
  const resolvedOptions = { ...options, anchors: resolveAnchors(ctx, options.anchors) };

  // Resolve providers
  const providers = resolveProviders(ctx, resolvedOptions.sources);
  if (providers.length === 0) return undefined;

  // Build collection (anchored or plain)
  const pframeSpec =
    ctx.services.pframeSpec ?? throwError("PFrameSpec service is required for column discovery.");
  const collection = new ColumnCollectionBuilder(pframeSpec)
    .addSources(providers)
    .build(resolvedOptions);
  if (collection === undefined) return undefined;

  try {
    // Find columns matching the selector
    const matched = collection.findColumns(resolvedOptions.columnsSelector ?? undefined);

    // Get anchor specs for matched columns
    const anchors = collection.getAnchorSpecs();

    // Normalize into DiscoveredColumn[]
    return mapToDiscoveredColumns(matched, anchors);
  } finally {
    collection.dispose();
  }
}

// --- Pure helper functions ---

/** Resolve PlRef values in anchors to PColumnSpec via the result pool. */
function resolveAnchors<A, U>(
  ctx: RenderCtxBase<A, U>,
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
function resolveProviders<A, U>(ctx: RenderCtxBase<A, U>, sources: undefined | ColumnSource[]) {
  return sources !== undefined
    ? sources.map(toColumnSnapshotProvider)
    : collectCtxColumnSnapshotProviders(ctx);
}

/** Map matched columns into a flat DiscoveredColumn list with deduped IDs. */
function mapToDiscoveredColumns(
  matched: readonly ColumnMatch[],
  anchors: readonly PColumnSpec[],
): DiscoveredColumn<SUniversalPColumnId>[] {
  const hitCounts = matched.reduce(
    (acc, match) => acc.set(match.originalId, (acc.get(match.originalId) ?? 0) + 1),
    new Map<PObjectId, number>(),
  );

  const hitIndices = new Map<PObjectId, number>();
  return matched.map((match) => {
    const snap = match.column;
    const snapSpecId = deriveNativeId(snap.spec);

    let id = snap.id;
    if ((hitCounts.get(match.originalId) ?? 0) > 1) {
      const idx = hitIndices.get(match.originalId) ?? 0;
      hitIndices.set(match.originalId, idx + 1);
      id = `${snap.id}#q${idx}` as SUniversalPColumnId;
    }

    return {
      id,
      originalId: match.originalId,
      spec: snap.spec,
      data: snap.data,
      dataStatus: snap.dataStatus,
      isAnchor: anchors.some((anchor) => snapSpecId === deriveNativeId(anchor)),
      linkerPath: match.path.map((step) => ({ column: step.linker })),
    };
  });
}
