import type {
  FieldData,
  OptionalResourceId,
  PlTransaction,
  ResourceId,
} from "@milaboratories/pl-client";
import { isNullResourceId } from "@milaboratories/pl-client";
import Denque from "denque";
import type { ExtendedResourceData, PlTreeState } from "./state";
import { msToHumanReadable } from "@milaboratories/ts-helpers";

/** Applied to list of fields in resource data. */
export type PruningFunction = (resource: ExtendedResourceData) => FieldData[];

export interface TreeLoadingRequest {
  /** Resource to prime the traversal algorithm. It is ok, if some of them
   * doesn't exist anymore. Should not contain elements from final resource
   * set. */
  readonly seedResources: ResourceId[];

  /** Resource ids for which state is already known and not expected to change.
   * Algorithm will not continue traversal over those ids, and states will not
   * be retrieved for them. */
  readonly finalResources: Set<ResourceId>;

  /** This function is applied to each resource data field list, before
   * using it continue traversal. This modification also is applied to
   * output data to make result self-consistent in terms that it will contain
   * all referenced resources, this is required to be able to pass it to tree
   * to update the state. */
  readonly pruningFunction?: PruningFunction;
}

/** Given the current tree state, build the request object to pass to
 * {@link loadTreeState} to load updated state. */
export function constructTreeLoadingRequest(
  tree: PlTreeState,
  pruningFunction?: PruningFunction,
): TreeLoadingRequest {
  const seedResources: ResourceId[] = [];
  const finalResources = new Set<ResourceId>();
  tree.forEachResource((res) => {
    if (res.finalState) finalResources.add(res.id);
    else seedResources.push(res.id);
  });

  // if tree is empty, seeding tree reconstruction from the specified root
  if (seedResources.length === 0 && finalResources.size === 0) seedResources.push(tree.root);

  return { seedResources, finalResources, pruningFunction };
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
  result += `Final resources skipped: ${stat.finalResourcesSkipped}`;
  return result;
}

/** Maximum number of concurrent gRPC resource fetches.
 * Bounds peak memory from in-flight request/response buffers. */
const MAX_CONCURRENT_FETCHES = 100;

/** Given the transaction (preferably read-only) and loading request, executes
 * the tree traversal algorithm, and collects fresh states of resources
 * to update the tree state. */
export async function loadTreeState(
  tx: PlTransaction,
  loadingRequest: TreeLoadingRequest,
  stats?: TreeLoadingStat,
): Promise<ExtendedResourceData[]> {
  // saving start timestamp to add time spent in this function to the stats at the end of the method
  const startTimestamp = Date.now();

  // counting the request
  if (stats) stats.requests++;

  const { seedResources, finalResources, pruningFunction } = loadingRequest;

  // Promises of resources whose gRPC requests are already in-flight.
  // Responses arrive in the same order as they were sent, so we can
  // wait for the earliest unprocessed promise at any given moment,
  // keeping the logic linear without recursion.
  const pending = new Denque<Promise<ExtendedResourceData | undefined>>();

  // vars to calculate number of roundtrips for stats
  let roundTripToggle: boolean = true;
  let numberOfRoundTrips = 0;

  // Resource ids discovered during traversal but not yet dispatched
  // due to the concurrency limit. Drained into `pending` each iteration.
  let inFlight = 0;
  const toDispatch = new Denque<ResourceId>();

  // tracking resources we already requested or queued
  const requested = new Set<ResourceId>();

  /** Fire gRPC requests for a single resource id. */
  const dispatch = (rid: ResourceId) => {
    inFlight++;

    const resourceData = tx.getResourceDataIfExists(rid, true);
    const kvData = tx.listKeyValuesIfResourceExists(rid);

    // counting round-trip (begin)
    const addRT = roundTripToggle;
    if (roundTripToggle) roundTripToggle = false;

    pending.push(
      (async () => {
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
      })(),
    );
  };

  /** Move queued resource ids into in-flight up to the concurrency limit. */
  const drainQueue = () => {
    while (inFlight < MAX_CONCURRENT_FETCHES) {
      const rid = toDispatch.shift();
      if (rid === undefined) break;
      dispatch(rid);
    }
  };

  /** Mark a resource for fetching. Deduplicates and respects final-resource set. */
  const requestState = (rid: OptionalResourceId) => {
    if (isNullResourceId(rid) || requested.has(rid)) return;

    if (finalResources.has(rid)) {
      if (stats) stats.finalResourcesSkipped++;
      return;
    }

    requested.add(rid);
    toDispatch.push(rid);
  };

  // sending seed requests
  seedResources.forEach((rid) => requestState(rid));

  const result: ExtendedResourceData[] = [];
  while (true) {
    // dispatch as many queued resources as the concurrency limit allows
    drainQueue();

    const nextResourcePromise = pending.shift();
    if (nextResourcePromise === undefined)
      // nothing in-flight and nothing queued — traversal is complete
      break;

    // at this point we pause and wait for the next requested resource state to arrive
    let nextResource = await nextResourcePromise;
    inFlight--;

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
    if (stats) {
      stats.retrievedResources++;
      stats.retrievedFields += nextResource.fields.length;
      stats.retrievedKeyValues += nextResource.kv.length;
      stats.retrievedResourceDataBytes += nextResource.data?.length ?? 0;
      for (const kv of nextResource.kv) stats.retrievedKeyValueBytes += kv.value.length;
    }

    // aggregating the state
    result.push(nextResource);
  }

  // adding the time we spent in this method to stats
  if (stats) {
    stats.millisSpent += Date.now() - startTimestamp;
    stats.roundTrips += numberOfRoundTrips;
  }

  return result;
}
