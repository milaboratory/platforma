import type {
  PColumnSpec,
  PlRef,
  PObjectId,
  RequireServices,
  Services,
  SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import { isPlRef } from "@milaboratories/pl-model-common";
import type { RenderCtxBase } from "../../../render";
import type {
  ColumnSource,
  AnchoredColumnCollection,
  ColumnSnapshot,
  ColumnMatch,
} from "../../../columns";
import { ColumnCollectionBuilder } from "../../../columns";
import { toColumnSnapshotProvider } from "../../../columns/column_snapshot_provider";
import { collectCtxColumnSnapshotProviders } from "../../../columns/ctx_column_sources";
import { throwError } from "@milaboratories/helpers";
import type {
  ColumnsSelectorConfig,
  DiscoveredColumn,
  ResolvedLinkerStep,
} from "./createPlDataTableV3";

export type DiscoveredColumnOptions = {
  sources?: ColumnSource[];
  anchors: Record<string, PObjectId | PColumnSpec | PlRef>;
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

    // Resolve linker snapshots
    const resolvedLinkers = resolveLinkerSnapshots(collection, matched);

    // Build anchor spec ID set
    const anchorIdSet = buildAnchorIdSet(collection, matched, resolvedOptions.anchors);

    // Normalize into DiscoveredColumn[]
    return mapToDiscoveredColumns(matched, resolvedLinkers, anchorIdSet);
  } finally {
    collection.dispose();
  }
}

// --- Pure helper functions ---

/** Resolve PlRef values in anchors to PColumnSpec via the result pool. */
function resolveAnchors<A, U>(
  ctx: RenderCtxBase<A, U>,
  anchors: Record<string, PObjectId | PColumnSpec | PlRef>,
): Record<string, PObjectId | PColumnSpec> {
  const result: Record<string, PObjectId | PColumnSpec> = {};
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

/** Pre-resolve linker column snapshots (deduped) for all matched columns. */
function resolveLinkerSnapshots(
  collection: AnchoredColumnCollection,
  matched: ColumnMatch[],
): Map<PObjectId, ColumnSnapshot<PObjectId>> {
  const result = new Map<PObjectId, ColumnSnapshot<PObjectId>>();
  for (const match of matched) {
    for (const step of match.path) {
      const linkerId = step.linker.columnId as PObjectId;
      if (result.has(linkerId)) continue;
      result.set(
        linkerId,
        collection.getColumnByOriginalId(linkerId) ??
          throwError(`Linker column ${linkerId} not found in anchored collection`),
      );
    }
  }
  return result;
}

/** Build set of canonical anchor spec IDs for isAnchor flagging.
 *  For PObjectId anchors — exact lookup in the collection.
 *  For PColumnSpec anchors — partial match against matched columns,
 *  because the provided spec may lack domain/contextDomain that real columns have. */
function buildAnchorIdSet(
  collection: AnchoredColumnCollection,
  matched: readonly ColumnMatch[],
  anchors: Record<string, PObjectId | PColumnSpec>,
): Set<PObjectId> {
  const result = new Set<PObjectId>();
  for (const anchor of Object.values(anchors)) {
    if (typeof anchor === "string") {
      const snap =
        collection.getColumnByOriginalId(anchor) ??
        throwError(`Anchor column ${anchor} not found in anchored collection`);
      result.add(snap.id);
    } else {
      for (const match of matched) {
        if (isPartialSpecMatch(anchor, match.column.spec)) {
          if (result.has(match.column.id)) {
            const specStr = JSON.stringify(anchor);
            throw new Error(
              `Multiple matched columns with ID ${match.column.id} for anchor spec ${specStr}. Consider making the anchor more specific by adding domain/contextDomain properties.`,
            );
          }
          result.add(match.column.id);
        }
      }
    }
  }

  if (result.size === 0) {
    throw new Error(
      "No anchors were matched in the discovered columns. Please check that your anchor specs correctly match the columns in the sources, and consider making them more specific by including domain/contextDomain properties.",
    );
  }

  return result;
}

/** Check that all fields present in the anchor spec match the candidate.
 *  axesSpec — candidate axes must be a subset of anchor axes (by name+type+domain subset).
 *  domain/contextDomain — each key in anchor must exist with same value in candidate. */
function isPartialSpecMatch(anchor: PColumnSpec, candidate: PColumnSpec): boolean {
  if (anchor.name !== candidate.name) return false;
  if (anchor.valueType !== candidate.valueType) return false;

  // Candidate axes must be a subset of anchor axes,
  // because anchor resolution may filter out some axes.
  // Each candidate axis must find a matching anchor axis by name + type,
  // and its domain must be a superset of the anchor axis domain.
  for (const cAxis of candidate.axesSpec) {
    const aAxis = anchor.axesSpec.find((a) => a.name === cAxis.name && a.type === cAxis.type);
    if (aAxis === undefined) return false;
    if (aAxis.domain !== undefined) {
      if (cAxis.domain === undefined) return false;
      for (const [k, v] of Object.entries(aAxis.domain)) {
        if (cAxis.domain[k] !== v) return false;
      }
    }
  }

  if (anchor.domain !== undefined) {
    if (candidate.domain === undefined) return false;
    for (const [k, v] of Object.entries(anchor.domain)) {
      if (candidate.domain[k] !== v) return false;
    }
  }

  if (anchor.contextDomain !== undefined) {
    if (candidate.contextDomain === undefined) return false;
    for (const [k, v] of Object.entries(anchor.contextDomain)) {
      if (candidate.contextDomain[k] !== v) return false;
    }
  }

  return true;
}

/** Build linker path for a single match entry. */
function buildLinkerPath(
  match: ColumnMatch,
  resolvedLinkers: Map<PObjectId, ColumnSnapshot<PObjectId>>,
): ResolvedLinkerStep[] {
  return match.path.map((step) => ({
    info: step,
    column:
      resolvedLinkers.get(step.linker.columnId as PObjectId) ??
      throwError(`Linker column ${step.linker.columnId} not found in resolved linkers map`),
  }));
}

/** Map matched columns into a flat DiscoveredColumn list with deduped IDs. */
function mapToDiscoveredColumns(
  matched: readonly ColumnMatch[],
  resolvedLinkers: Map<PObjectId, ColumnSnapshot<PObjectId>>,
  anchorIdSet: Set<PObjectId>,
): DiscoveredColumn<SUniversalPColumnId>[] {
  const hitCounts = matched.reduce(
    (acc, match) => acc.set(match.originalId, (acc.get(match.originalId) ?? 0) + 1),
    new Map<PObjectId, number>(),
  );

  const hitIndices = new Map<PObjectId, number>();
  return matched.map((match) => {
    const snap = match.column;

    let id = snap.id;
    if ((hitCounts.get(match.originalId) ?? 0) > 1) {
      const idx = hitIndices.get(match.originalId) ?? 0;
      hitIndices.set(match.originalId, idx + 1);
      id = `${snap.id}#q${idx}` as SUniversalPColumnId;
    }

    return {
      id,
      spec: snap.spec,
      dataStatus: snap.dataStatus,
      data: snap.data,
      isAnchor: anchorIdSet.has(snap.id),
      linkerPath: buildLinkerPath(match, resolvedLinkers),
    };
  });
}
