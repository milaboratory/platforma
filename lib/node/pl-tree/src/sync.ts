import type {
  FieldData,
  Filter,
  OptionalSignedResourceId,
  PlTransaction,
  ResourceTreeFrame,
  SignedResourceId,
} from "@milaboratories/pl-client";
import Denque from "denque";
import { hasCapability, isNullSignedResourceId } from "@milaboratories/pl-client";
import type { ExtendedResourceData, PlTreeState, ResourceUpdateStat } from "./state";
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
 * - `"auto"` (default): use backend streaming when the backend advertises `treeFilter:v2`,
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
  const materialized = new Set<SignedResourceId>();
  tree.forEachResource((res) => {
    materialized.add(res.id);
    if (res.finalState) finalResources.add(res.id);
    else seedResources.push(res.id);
  });

  for (const root of tree.roots) if (!materialized.has(root)) seedResources.push(root);

  return {
    seedResources,
    finalResources,
    pruningFunction: options.pruningFunction,
    fieldFilter: options.fieldFilter,
    traverseStopRules: options.traverseStopRules,
  };
}

export type TreeLoadingStat = ResourceUpdateStat & {
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
  /** Streaming (resourceTree) path: resourceTree() streams consumed (1, or 2 with a follow-up). */
  streamRounds: number;
  /** Streaming path: resource frames received. */
  resourceFrames: number;
  /** Streaming path: stopMarker frames received (both skipped and follow-up). */
  stopMarkerFrames: number;
  /** Streaming path: stop markers that were not final locally and triggered a follow-up fetch. */
  stopMarkersFollowUp: number;
  /** Streaming path: frames where the backend stopped traversal (final or traverseWasStopped). */
  traverseWasStoppedCount: number;
  /** BFS path: resource states actually requested from the backend this cycle (after intra-cycle dedup). */
  bfsResourcesRequested: number;
  /** BFS path: requested resources that no longer exist (undefined reply). */
  bfsResourcesNotFound: number;
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
    streamRounds: 0,
    resourceFrames: 0,
    stopMarkerFrames: 0,
    stopMarkersFollowUp: 0,
    traverseWasStoppedCount: 0,
    bfsResourcesRequested: 0,
    bfsResourcesNotFound: 0,
    resourcesNew: 0,
    resourcesChanged: 0,
    resourcesUnchanged: 0,
    bytesUnchanged: 0,
    metadataStableChanged: 0,
    bfsRequestsWasted: 0,
    usedStreaming: false,
    fieldsAdded: 0,
    fieldsRemoved: 0,
    fieldsChanged: 0,
    kvChanged: 0,
    readyFlips: 0,
    locksChanged: 0,
    errorsAttached: 0,
    duplicatesResolved: 0,
    resourcesMarkedFinal: 0,
  };
}

export function formatTreeLoadingStat(stat: TreeLoadingStat): string {
  return `Requests: ${stat.requests}
Total time: ${msToHumanReadable(stat.millisSpent)}
Round-trips: ${stat.roundTrips}
Resources: ${stat.retrievedResources}
Fields: ${stat.retrievedFields}
KV: ${stat.retrievedKeyValues}
Data Bytes: ${stat.retrievedResourceDataBytes}
KV Bytes: ${stat.retrievedKeyValueBytes}
Pruned fields: ${stat.prunedFields}
Final resources skipped: ${stat.finalResourcesSkipped}
Stop markers skipped: ${stat.stopMarkersSkipped}
Stop marker follow-up round-trips: ${stat.stopMarkerFollowUpRoundTrips}
New resources: ${stat.resourcesNew}
Changed resources: ${stat.resourcesChanged}
Unchanged (duplicate re-fetch) resources: ${stat.resourcesUnchanged}
Unchanged bytes (wasted downlink): ${stat.bytesUnchanged}
Changed with stable metadata: ${stat.metadataStableChanged}
BFS fetches wasted on unchanged: ${stat.bfsRequestsWasted}
Used streaming: ${stat.usedStreaming}
[streaming] rounds: ${stat.streamRounds}, resource frames: ${stat.resourceFrames}, stop-marker frames: ${stat.stopMarkerFrames}, stop->follow-up: ${stat.stopMarkersFollowUp}, traverse-stopped: ${stat.traverseWasStoppedCount}
[bfs] resources requested: ${stat.bfsResourcesRequested}, not found: ${stat.bfsResourcesNotFound}`;
}

function supportsResourceTreeTraversal(capabilities: readonly string[] = []): boolean {
  return hasCapability(capabilities, "treeFilter:v2");
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
    if (stats) stats.bfsResourcesRequested++;

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

        if (resource === undefined) {
          if (stats) stats.bfsResourcesNotFound++;
          return undefined;
        }
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
      if (stats) stats.stopMarkerFrames++;
      if (finalResources.has(frame.id)) {
        if (stats) stats.stopMarkersSkipped++;
        continue;
      }
      if (stats) stats.stopMarkersFollowUp++;
      followUpSeeds.push(frame.id);
      continue;
    }

    // Normal resource frame.
    if (stats) {
      stats.resourceFrames++;
      if (frame.traverseWasStopped) stats.traverseWasStoppedCount++;
    }
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
  if (stats) {
    stats.roundTrips++;
    stats.streamRounds++;
  }

  // Resolve stop-marker seeds by fetching them, then expand into whatever they reference that we
  // do not already have. Dedup fetched ids so shared refs or diamonds cannot loop forever (the id
  // set is finite, so the loop terminates). A referenced resource left unloaded would make
  // updateFromResourceData throw "orphan resource".
  //
  // `maxDepth: 0` fetches only the seeds' own state, mirroring Get.Request. Two reasons it must be
  // capped:
  //   - traverseStopRules cannot be reapplied here, because the seeds are themselves the
  //     stop-marked resources and the rule would re-flag them instead of returning their state;
  //   - without stop rules an uncapped traversal streams each seed's entire subtree. Every
  //     already-final descendant is discarded on arrival (`finalResourcesSkipped`), so the cost is
  //     pure waste: a single block reorder made the server stream 2041 such frames (1.2s) to
  //     deliver 6 new resources.
  // Expansion then walks one level per round, skipping anything already known final (immutable, so
  // already in the tree) or already loaded in this batch — the same predicate the client-side BFS
  // path uses.
  let pendingSeeds = followUpSeeds;
  const fetchedSeeds = new Set<SignedResourceId>();
  const loaded = new Set<SignedResourceId>(result.map((resource) => resource.id));
  while (pendingSeeds.length > 0) {
    const roundSeeds = pendingSeeds.filter((id) => !fetchedSeeds.has(id));
    if (roundSeeds.length === 0) break;
    for (const id of roundSeeds) fetchedSeeds.add(id);

    const followUpItems = tx.resourceTree(roundSeeds, {
      includeKv: true,
      fieldFilter,
      maxDepth: 0,
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
        `loadTreeStateViaResourceTree: follow-up request for ${roundSeeds.length} stop-marker seeds: ${JSON.stringify(roundSeeds)}`,
      );
      stats.roundTrips++;
      stats.streamRounds++;
      stats.stopMarkerFollowUpRoundTrips++;
    }

    const nextSeeds: SignedResourceId[] = [];
    const enqueue = (rid: OptionalSignedResourceId): void => {
      if (isNullSignedResourceId(rid)) return;
      if (finalResources.has(rid) || loaded.has(rid) || fetchedSeeds.has(rid)) return;
      nextSeeds.push(rid);
    };
    for (const resource of followUpResult) {
      loaded.add(resource.id);
      enqueue(resource.error);
      for (const field of resource.fields) {
        enqueue(field.value);
        enqueue(field.error);
      }
    }
    pendingSeeds = nextSeeds;
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

    if (stats) stats.usedStreaming = wantsStreaming && supportsResourceTreeTraversal(capabilities);

    if (wantsStreaming && !supportsResourceTreeTraversal(capabilities)) {
      const msg =
        "traversalMode=backend-streaming but backend lacks treeFilter:v2 capability; falling back to BFS";
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
