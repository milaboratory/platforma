import type {
  FieldData,
  Filter,
  OptionalSignedResourceId,
  PlTransaction,
  ResourceTreeFrame,
  SignedResourceId,
} from "@milaboratories/pl-client";
import Denque from "denque";
import { CapabilityTreeFilter, isNullSignedResourceId } from "@milaboratories/pl-client";
import type { ExtendedResourceData, PlTreeState } from "./state";
import { ConcurrencyLimitingExecutor, msToHumanReadable } from "@milaboratories/ts-helpers";

/** Applied to list of fields in resource data. */
export type PruningFunction = (resource: ExtendedResourceData) => FieldData[];

export interface TreeLoadingRequest {
  /** Resource to prime the traversal algorithm. It is ok, if some of them
   * doesn't exist anymore. Should not contain elements from final resource
   * set. */
  readonly seedResources: SignedResourceId[];

  /** Resource ids for which state is already known and not expected to change.
   * Algorithm will not continue traversal over those ids, and states will not
   * be retrieved for them. */
  readonly finalResources: Set<SignedResourceId>;

  /** Applied to each resource field list in fallback BFS mode and to streamed results. */
  readonly pruningFunction?: PruningFunction;

  /** ResourceTree field filter passed to the backend when supported. */
  readonly fieldFilter?: Filter;

  /** ResourceTree traversal stop rules passed to the backend when supported. */
  readonly traverseStopRules?: Filter;
}

/** Controls which tree-loading path is used.
 * - `"auto"` (default): use backend streaming when the backend advertises `treeFilter:v1`,
 *   fall back to client-side BFS otherwise.
 * - `"client-bfs"`: always use client-side BFS, even on capable backends.
 * - `"backend-streaming"`: always prefer backend streaming; if the capability is absent,
 *   logs a warning and falls back to BFS (never throws).
 */
export type TraversalMode = "auto" | "client-bfs" | "backend-streaming";

/** Given the current tree state, build the request object to pass to
 * {@link loadTreeState} to load updated state. */
export function constructTreeLoadingRequest(
  tree: PlTreeState,
  options: Pick<TreeLoadingRequest, "pruningFunction" | "fieldFilter" | "traverseStopRules"> = {},
): TreeLoadingRequest {
  const seedResources: SignedResourceId[] = [];
  const finalResources = new Set<SignedResourceId>();
  tree.forEachResource((res) => {
    if (res.finalState) finalResources.add(res.id);
    else seedResources.push(res.id);
  });

  // if tree is empty, seeding tree reconstruction from the specified root
  if (seedResources.length === 0 && finalResources.size === 0) seedResources.push(tree.root);

  return {
    seedResources,
    finalResources,
    pruningFunction: options.pruningFunction,
    fieldFilter: options.fieldFilter,
    traverseStopRules: options.traverseStopRules,
  };
}

export type TreeLoadingStat = {
  requests: number;
  roundTrips: number;
  retrievedResources: number;
  retrievedFields: number;
  retrievedKeyValues: number;
  retrievedResourceDataBytes: number;
  retrievedKeyValueBytes: number;
  prunedFields: number;
  finalResourcesSkipped: number;
  millisSpent: number;
  /** Stop-marker frames whose id was already final locally and were skipped. */
  stopMarkersSkipped: number;
  /** Number of follow-up resourceTree() calls issued to resolve unknown stop markers. */
  stopMarkerFollowUpRoundTrips: number;
};

export function initialTreeLoadingStat(): TreeLoadingStat {
  return {
    requests: 0,
    roundTrips: 0,
    retrievedResources: 0,
    retrievedFields: 0,
    retrievedKeyValues: 0,
    retrievedResourceDataBytes: 0,
    retrievedKeyValueBytes: 0,
    prunedFields: 0,
    finalResourcesSkipped: 0,
    millisSpent: 0,
    stopMarkersSkipped: 0,
    stopMarkerFollowUpRoundTrips: 0,
  };
}

export function formatTreeLoadingStat(stat: TreeLoadingStat): string {
  let result = `Requests: ${stat.requests}\n`;
  result += `Total time: ${msToHumanReadable(stat.millisSpent)}\n`;
  result += `Round-trips: ${stat.roundTrips}\n`;
  result += `Resources: ${stat.retrievedResources}\n`;
  result += `Fields: ${stat.retrievedFields}\n`;
  result += `KV: ${stat.retrievedKeyValues}\n`;
  result += `Data Bytes: ${stat.retrievedResourceDataBytes}\n`;
  result += `KV Bytes: ${stat.retrievedKeyValueBytes}\n`;
  result += `Pruned fields: ${stat.prunedFields}\n`;
  result += `Final resources skipped: ${stat.finalResourcesSkipped}\n`;
  result += `Stop markers skipped: ${stat.stopMarkersSkipped}\n`;
  result += `Stop marker follow-up round-trips: ${stat.stopMarkerFollowUpRoundTrips}`;
  return result;
}

function supportsResourceTreeTraversal(capabilities: readonly string[] = []): boolean {
  return capabilities.includes(CapabilityTreeFilter);
}

function collectStatsForResource(resource: ExtendedResourceData, stats?: TreeLoadingStat) {
  if (!stats) return;
  stats.retrievedResources++;
  stats.retrievedFields += resource.fields.length;
  stats.retrievedKeyValues += resource.kv.length;
  stats.retrievedResourceDataBytes += resource.data?.length ?? 0;
  for (const kv of resource.kv) stats.retrievedKeyValueBytes += kv.value.length;
}

async function loadTreeStateViaBfs(
  tx: PlTransaction,
  loadingRequest: TreeLoadingRequest,
  stats?: TreeLoadingStat,
): Promise<ExtendedResourceData[]> {
  const { seedResources, finalResources, pruningFunction } = loadingRequest;

  // Limits the number of concurrent gRPC fetches to bound peak memory
  // from in-flight request/response buffers.
  const limiter = new ConcurrencyLimitingExecutor(100);

  // Promises of resource states, in the order they were requested.
  const pending = new Denque<Promise<ExtendedResourceData | undefined>>();

  // vars to calculate number of roundtrips for stats
  let roundTripToggle: boolean = true;
  let numberOfRoundTrips = 0;

  // tracking resources we already requested or queued
  const requested = new Set<SignedResourceId>();

  /** Mark a resource for fetching. Deduplicates and respects final-resource set. */
  const requestState = (rid: OptionalSignedResourceId) => {
    if (isNullSignedResourceId(rid) || requested.has(rid)) return;

    if (finalResources.has(rid)) {
      if (stats) stats.finalResourcesSkipped++;
      return;
    }

    requested.add(rid);

    pending.push(
      limiter.run(async () => {
        const resourceData = tx.getResourceDataIfExists(rid, true);
        const kvData = tx.listKeyValuesIfResourceExists(rid);

        // counting round-trip (begin)
        const addRT = roundTripToggle;
        if (roundTripToggle) roundTripToggle = false;

        const [resource, kv] = await Promise.all([resourceData, kvData]);

        // counting round-trip, actually incrementing counter and returning toggle back,
        // so the next request can acquire it
        if (addRT) {
          numberOfRoundTrips++;
          roundTripToggle = true;
        }

        if (resource === undefined) return undefined;
        if (kv === undefined) throw new Error("Inconsistent replies");

        return { ...resource, kv };
      }),
    );
  };

  // sending seed requests
  seedResources.forEach((rid) => requestState(rid));

  const result: ExtendedResourceData[] = [];
  let nextPromise: Promise<ExtendedResourceData | undefined> | undefined;
  while ((nextPromise = pending.shift()) !== undefined) {
    // at this point we pause and wait for the next requested resource state to arrive
    let nextResource = await nextPromise;
    if (nextResource === undefined)
      // ignoring resources that were not found (this may happen for seed resource ids)
      continue;

    if (pruningFunction !== undefined) {
      // apply field pruning, if requested
      const fieldsAfterPruning = pruningFunction(nextResource);
      // collecting stats
      if (stats) stats.prunedFields += nextResource.fields.length - fieldsAfterPruning.length;
      nextResource = { ...nextResource, fields: fieldsAfterPruning };
    }

    // continue traversal over the referenced resources
    requestState(nextResource.error);
    for (const field of nextResource.fields) {
      requestState(field.value);
      requestState(field.error);
    }

    // collecting stats
    collectStatsForResource(nextResource, stats);

    // aggregating the state
    result.push(nextResource);
  }

  if (stats) stats.roundTrips += numberOfRoundTrips;

  return result;
}

async function processResourceTreeStream(
  treeItems: AsyncIterable<ResourceTreeFrame>,
  finalResources: Set<SignedResourceId>,
  pruningFunction: PruningFunction | undefined,
  stats: TreeLoadingStat | undefined,
): Promise<{ result: ExtendedResourceData[]; followUpSeeds: SignedResourceId[] }> {
  const result: ExtendedResourceData[] = [];
  const followUpSeeds: SignedResourceId[] = [];

  // backend returns two types of frames:
  // - 'resource' frames contain the resource state and are processed normally
  // - 'stopMarker' frames indicate resources that are ignored due stop rules fired
  //
  // Usually stop rules indicates the resources with final state. In that case middle layer
  // should make a decision: has it already loaded the resource or should it be requested for get the latest state?
  for await (const frame of treeItems) {
    if (frame.frameKind === "stopMarker") {
      if (finalResources.has(frame.id)) {
        if (stats) stats.stopMarkersSkipped++;
        continue;
      }
      followUpSeeds.push(frame.id);
      continue;
    }

    // Normal resource frame.
    if (finalResources.has(frame.id)) {
      if (stats) stats.finalResourcesSkipped++;
      continue;
    }

    let nextResource: ExtendedResourceData = {
      id: frame.id,
      type: frame.type,
      kind: frame.kind,
      data: frame.data,
      resourceReady: frame.resourceReady,
      error: frame.error,
      originalResourceId: frame.originalResourceId,
      // traverseWasStopped: backend matched traverse stop rules — children were not streamed.
      // Mark as terminal; fields are resolved below.
      final: frame.final || frame.traverseWasStopped,
      inputsLocked: frame.inputsLocked,
      outputsLocked: frame.outputsLocked,
      fields: frame.fields,
      kv: frame.kv,
    };

    // Apply field rules: traverseWasStopped drops all fields to keep the refCount
    // invariant; pruning function further filters the remaining fields.
    const rawFields = frame.traverseWasStopped ? [] : nextResource.fields;
    const resolvedFields =
      pruningFunction !== undefined
        ? pruningFunction({ ...nextResource, fields: rawFields })
        : rawFields;
    if (stats) stats.prunedFields += nextResource.fields.length - resolvedFields.length;
    nextResource = { ...nextResource, fields: resolvedFields };

    collectStatsForResource(nextResource, stats);
    result.push(nextResource);
  }

  return { result, followUpSeeds };
}

async function loadTreeStateViaResourceTree(
  tx: PlTransaction,
  loadingRequest: TreeLoadingRequest,
  stats?: TreeLoadingStat,
  logger?: { warn: (msg: string) => void; info?: (msg: unknown) => void },
): Promise<ExtendedResourceData[]> {
  const { seedResources, finalResources, pruningFunction, fieldFilter, traverseStopRules } =
    loadingRequest;

  // Round 0: initial tree traversal.
  const treeItems = tx.resourceTree(seedResources, {
    includeKv: true,
    fieldFilter,
    traverseStopRules,
  });

  const { result, followUpSeeds } = await processResourceTreeStream(
    treeItems,
    finalResources,
    pruningFunction,
    stats,
  );
  if (stats) stats.roundTrips++;

  // Client must request full resource tree in case when stop-marker seeds are returned,
  // to ensure all resources are loaded and stop-marker frames are processed.
  if (followUpSeeds.length > 0) {
    const followUpItems = tx.resourceTree(followUpSeeds, {
      includeKv: true,
      fieldFilter,
    });
    const { result: followUpResult } = await processResourceTreeStream(
      followUpItems,
      finalResources,
      pruningFunction,
      stats,
    );
    result.push(...followUpResult);
    if (stats) {
      logger?.info?.(
        `loadTreeStateViaResourceTree: follow-up request for ${followUpSeeds.length} stop-marker seeds: ${JSON.stringify(followUpSeeds)}`,
      );
      stats.roundTrips++;
      stats.stopMarkerFollowUpRoundTrips++;
    }
  }

  return result;
}

/** Given the transaction (preferably read-only) and loading request, executes
 * the tree traversal algorithm, and collects fresh states of resources
 * to update the tree state. */
export async function loadTreeState(
  tx: PlTransaction,
  loadingRequest: TreeLoadingRequest,
  stats?: TreeLoadingStat,
  capabilities: readonly string[] = [],
  mode: TraversalMode = "auto",
  logger?: { warn: (msg: string) => void; info?: (msg: unknown) => void },
): Promise<ExtendedResourceData[]> {
  const startTimestamp = Date.now();
  if (stats) stats.requests++;

  try {
    const wantsStreaming =
      mode === "backend-streaming" ||
      (mode === "auto" && supportsResourceTreeTraversal(capabilities));

    if (wantsStreaming && !supportsResourceTreeTraversal(capabilities)) {
      const msg =
        "traversalMode=backend-streaming but backend lacks treeFilter:v1 capability; falling back to BFS";
      if (logger) logger.warn(msg);
      else console.warn(msg);
      return await loadTreeStateViaBfs(tx, loadingRequest, stats);
    }

    return wantsStreaming
      ? await loadTreeStateViaResourceTree(tx, loadingRequest, stats, logger)
      : await loadTreeStateViaBfs(tx, loadingRequest, stats);
  } finally {
    if (stats) stats.millisSpent += Date.now() - startTimestamp;
  }
}
