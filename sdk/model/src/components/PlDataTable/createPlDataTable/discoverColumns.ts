import type {
  CanonicalizedJson,
  PColumnSpec,
  PColumnSpecId,
  PObjectId,
  SUniversalPColumnId,
} from "@milaboratories/pl-model-common";
import { canonicalizeJson, getPColumnSpecId } from "@milaboratories/pl-model-common";
import type { RenderCtxBase } from "../../../render";
import type {
  ColumnSource,
  AnchoredColumnCollection,
  ColumnSnapshot,
  ColumnMatch,
} from "../../../columns";
import { ColumnCollectionBuilder } from "../../../columns";
import { isColumnSnapshotProvider } from "../../../columns/column_snapshot_provider";
import { collectCtxColumnSnapshotProviders } from "../../../columns/ctx_column_sources";
import { throwError } from "@milaboratories/helpers";
import type {
  ColumnsSelectorConfig,
  DiscoveredColumn,
  ResolvedLinkerStep,
} from "./createPlDataTableV3";

export type DiscoveredColumnOptions = {
  sources?: ColumnSource | ColumnSource[];
  anchors: Record<string, PObjectId | PColumnSpec>;
  columnsSelector: ColumnsSelectorConfig;
};

/** Discover columns from sources/anchors and normalize into a flat DiscoveredColumn list. */
export function discoverColumns<A, U>(
  ctx: RenderCtxBase<A, U>,
  options: DiscoveredColumnOptions,
): DiscoveredColumn<SUniversalPColumnId>[] | undefined {
  // 1. Resolve providers
  const providers = resolveProviders(ctx, options.sources);
  if (providers.length === 0) return undefined;

  // 2. Build collection (anchored or plain)
  const builder = new ColumnCollectionBuilder(
    ctx.services.pframeSpec ?? throwError("PFrameSpec service is required for column discovery."),
  ).addSources(providers);
  const collection = builder.build(options);
  if (collection === undefined) return undefined;

  try {
    // 3. Find columns matching the selector
    const matched = collection.findColumns(options.columnsSelector ?? undefined);

    // 4. Resolve linker snapshots
    const resolvedLinkers = resolveLinkerSnapshots(collection, matched);

    // 5. Build anchor spec ID set
    const anchorSpecIdSet = buildAnchorSpecIdSet(collection, options.anchors);

    // 6. Normalize into DiscoveredColumn[]
    return mapToDiscoveredColumns(matched, resolvedLinkers, anchorSpecIdSet);
  } finally {
    collection.dispose();
  }
}

// --- Pure helper functions ---

/** Resolve column snapshot providers from explicit sources or context. */
function resolveProviders<A, U>(
  ctx: RenderCtxBase<A, U>,
  sources: ColumnSource | ColumnSource[] | undefined,
) {
  return sources
    ? normalizeSourceList(sources).filter(isColumnSnapshotProvider)
    : collectCtxColumnSnapshotProviders(ctx);
}

/** Normalize raw ColumnSource | ColumnSource[] into a flat list of sources. */
function normalizeSourceList(source: ColumnSource | ColumnSource[]): ColumnSource[] {
  if (
    Array.isArray(source) &&
    source.length > 0 &&
    (Array.isArray(source[0]) || isColumnSnapshotProvider(source[0]))
  ) {
    return source as ColumnSource[];
  }
  return [source as ColumnSource];
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

/** Build set of canonical anchor spec IDs for isAnchor flagging. */
function buildAnchorSpecIdSet(
  collection: AnchoredColumnCollection,
  anchors: Record<string, PObjectId | PColumnSpec>,
): Set<CanonicalizedJson<PColumnSpecId>> {
  const result = new Set<CanonicalizedJson<PColumnSpecId>>();
  for (const anchor of Object.values(anchors)) {
    if (typeof anchor === "string") {
      const snap =
        collection.getColumnByOriginalId(anchor) ??
        throwError(`Anchor column ${anchor} not found in anchored collection`);
      result.add(canonicalizeJson(getPColumnSpecId(snap.spec)));
    } else {
      result.add(canonicalizeJson(getPColumnSpecId(anchor)));
    }
  }
  return result;
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
  anchorSpecIdSet: Set<CanonicalizedJson<PColumnSpecId>>,
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
      isAnchor: anchorSpecIdSet.has(canonicalizeJson(getPColumnSpecId(snap.spec))),
      linkerPath: buildLinkerPath(match, resolvedLinkers),
    };
  });
}
