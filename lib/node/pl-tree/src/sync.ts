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
import { loadDeltaTreeState } from "./delta_sync";

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

  /** ResourceTree traversal stop rules passed to the backend when supported.
   * Ignored by the backend under {@link changedSinceToken}. */
  readonly traverseStopRules?: Filter;

  /** The tree's roots. Delta seeds at these when finalisation is off, and when the
   * non-final frontier is empty. */
  readonly roots: readonly SignedResourceId[];

  /** Every id the mirror currently holds, final or not. Delta needs it to tell a reference
   * it must resolve from one already satisfied locally; the union of this and
   * {@link seedResources} is what the mirror contains. */
  readonly knownResources: ReadonlySet<SignedResourceId>;

  /** Change token from the transaction this request will run in, for a delta walk. Absent
   * means "send the full tree", which is also what a token the server cannot use gets. */
  readonly changedSinceToken?: Uint8Array;
}

/** Controls which tree-loading path is used.
 * - `"auto"` (default): use delta polling when the backend advertises `treeChangedSince:v1`,
 *   else backend streaming when it advertises `treeFilter:v2`, else client-side BFS.
 * - `"client-bfs"`: always use client-side BFS, even on capable backends.
 * - `"backend-streaming"`: always prefer backend streaming; if the capability is absent,
 *   logs a warning and falls back to BFS (never throws).
 * - `"backend-delta"`: always prefer delta polling, which hands the backend the transaction's
 *   change token and takes only what changed since it; if `treeChangedSince:v1` is absent,
 *   logs a warning and falls back to the best available path (never throws).
 */
export type TraversalMode = "auto" | "client-bfs" | "backend-streaming" | "backend-delta";

/** A concrete loading algorithm: a {@link TraversalMode} with `"auto"` and any unsupported
 * preference already resolved against the server's capabilities. */
export type TreeLoadingAlgorithmName = "client-bfs" | "backend-streaming" | "backend-delta";

/** Resolves a traversal mode into the algorithm a tree will run. A tree calls this once, when
 * it is made, and keeps the answer for its whole life, so the choice (and the fallback warning
 * for a preference the backend cannot serve) happens once rather than on every poll. */
export function resolveTreeLoadingAlgorithm(
  mode: TraversalMode,
  capabilities: readonly string[] = [],
  logger?: { warn: (msg: string) => void },
): TreeLoadingAlgorithmName {
  const streaming = supportsResourceTreeTraversal(capabilities);
  const delta = supportsTreeDelta(capabilities);
  switch (mode) {
    case "client-bfs":
      return "client-bfs";
    case "backend-delta":
      if (delta) return "backend-delta";
      (logger ?? console).warn(
        "traversalMode=backend-delta but backend lacks treeChangedSince:v1 capability; falling back to " +
          (streaming ? "backend-streaming" : "client-bfs"),
      );
      return streaming ? "backend-streaming" : "client-bfs";
    case "backend-streaming":
      if (streaming) return "backend-streaming";
      (logger ?? console).warn(
        "traversalMode=backend-streaming but backend lacks treeFilter:v2 capability; falling back to BFS",
      );
      return "client-bfs";
    case "auto":
      // Delta first: it is the only path whose cost tracks what changed rather than what the
      // tree holds. Streaming is the fallback for a backend that can shape a walk but not
      // date one, and BFS for a backend that can do neither.
      if (delta) return "backend-delta";
      return streaming ? "backend-streaming" : "client-bfs";
  }
}

/** Given the current tree state, build the request object to pass to
 * {@link loadTreeState} to load updated state. */
export function constructTreeLoadingRequest(
  tree: PlTreeState,
  options: Pick<
    TreeLoadingRequest,
    "pruningFunction" | "fieldFilter" | "traverseStopRules" | "changedSinceToken"
  > = {},
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
    roots: [...tree.roots],
    knownResources: materialized,
    pruningFunction: options.pruningFunction,
    fieldFilter: options.fieldFilter,
    traverseStopRules: options.traverseStopRules,
    changedSinceToken: options.changedSinceToken,
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
  /** Backend paths: resourceTree() streams consumed. Streaming spends 1, or 2 with a
   * follow-up; delta spends 1 plus one per resolution round. */
  streamRounds: number;
  /** Backend paths: resource frames received. */
  resourceFrames: number;
  /** Backend paths: stopMarker frames received. Streaming expects these; on delta they are a
   * contract violation and are warned about. */
  stopMarkerFrames: number;
  /** Streaming path: stop markers that were not final locally and triggered a follow-up fetch. */
  stopMarkersFollowUp: number;
  /** Streaming path: frames where the backend stopped traversal (final or traverseWasStopped). */
  traverseWasStoppedCount: number;
  /** BFS path: resource states actually requested from the backend this cycle (after intra-cycle dedup). */
  bfsResourcesRequested: number;
  /** BFS path: requested resources that no longer exist (undefined reply). */
  bfsResourcesNotFound: number;
  /** Delta path: seed ids handed to the backend, summed over every round of the poll.
   * This is what finalisation costs: the frontier is many seeds, the roots are few. */
  deltaSeedsSent: number;
  /** Delta path: extra rounds spent resolving references a delta body pointed at but the
   * response did not carry. */
  deltaResolutionRounds: number;
  /** Delta path: polls that sent a token and got back a response the size of the whole
   * mirror, which is what a token the server refused looks like from here.
   *
   * Rejection is silent by design - a foreign-instance or rewound token is answered with the
   * full tree, never an error - so without this a tree paying full-tree cost on every poll
   * after a backend instance swap is indistinguishable from a healthy one. Heuristic, not a
   * signal from the server: a genuinely large change set trips it too. */
  deltaSuspectedFullAnswers: number;
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
    deltaSeedsSent: 0,
    deltaResolutionRounds: 0,
    deltaSuspectedFullAnswers: 0,
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
[backend] rounds: ${stat.streamRounds}, resource frames: ${stat.resourceFrames}, stop-marker frames: ${stat.stopMarkerFrames}, stop->follow-up: ${stat.stopMarkersFollowUp}, traverse-stopped: ${stat.traverseWasStoppedCount}
[bfs] resources requested: ${stat.bfsResourcesRequested}, not found: ${stat.bfsResourcesNotFound}
[delta] seeds sent: ${stat.deltaSeedsSent}, resolution rounds: ${stat.deltaResolutionRounds}, suspected full answers: ${stat.deltaSuspectedFullAnswers}`;
}

function supportsResourceTreeTraversal(capabilities: readonly string[] = []): boolean {
  return hasCapability(capabilities, "treeFilter:v2");
}

function supportsTreeDelta(capabilities: readonly string[] = []): boolean {
  return hasCapability(capabilities, "treeChangedSince:v1");
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

  // Resolve stop-marker seeds by fetching them (see the note below on why the stop rule is not
  // reapplied). Loop in case a fetch still yields stop markers; dedup fetched ids so shared refs
  // or diamonds cannot loop forever (the id set is finite, so the loop terminates). A referenced
  // resource left unloaded would make updateFromResourceData throw "orphan resource".
  let pendingSeeds = followUpSeeds;
  const fetchedSeeds = new Set<SignedResourceId>();
  while (pendingSeeds.length > 0) {
    const roundSeeds = pendingSeeds.filter((id) => !fetchedSeeds.has(id));
    if (roundSeeds.length === 0) break;
    for (const id of roundSeeds) fetchedSeeds.add(id);

    // No traverseStopRules here on purpose: the seeds are the stop-marked resources, and the
    // stop rule (finality-based) would re-flag them as stop markers instead of loading their
    // state, leaving resources that reference them as orphans. The retry must fetch them plainly.
    const followUpItems = tx.resourceTree(roundSeeds, {
      includeKv: true,
      fieldFilter,
    });
    const { result: followUpResult, followUpSeeds: nextSeeds } = await processResourceTreeStream(
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
    // A tree passes its pinned algorithm here, which resolves to itself. The mode form is
    // kept for callers that run a single load.
    const algorithm = resolveTreeLoadingAlgorithm(mode, capabilities, logger);
    // True for both backend paths, not just streaming. state.ts reads this to decide whether
    // an unchanged resource cost a wasted per-resource fetch, which is a BFS-only concept:
    // leaving it false for delta reports phantom "BFS fetches wasted" on a delta tree.
    if (stats) stats.usedStreaming = algorithm !== "client-bfs";

    switch (algorithm) {
      case "backend-delta":
        return await loadDeltaTreeState(tx, loadingRequest, stats, logger);
      case "backend-streaming":
        return await loadTreeStateViaResourceTree(tx, loadingRequest, stats, logger);
      case "client-bfs":
        return await loadTreeStateViaBfs(tx, loadingRequest, stats);
      default:
        throw new Error(`unknown tree loading algorithm: ${algorithm as string}`);
    }
  } finally {
    if (stats) stats.millisSpent += Date.now() - startTimestamp;
  }
}
