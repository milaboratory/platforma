import type {
  FieldData,
  OptionalResourceId,
  PlTransaction,
  PruningSpec,
  ResourceId,
} from "@milaboratories/pl-client";
import Denque from "denque";
import { isNullResourceId } from "@milaboratories/pl-client";
import type { ExtendedResourceData, PlTreeState } from "./state";
import { ConcurrencyLimitingExecutor, msToHumanReadable } from "@milaboratories/ts-helpers";

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

  /** Tree root, used as the sole seed when the server-side loader is active
   * (see {@link loadTreeStateServerSide}). */
  readonly root: ResourceId;

  /** Wire-level pruning spec, mirroring {@link pruningFunction} but in a
   * declarative shape transmissible to the server. Populated by callers that
   * wish to opt into server-side loading. */
  readonly pruningSpec?: PruningSpec;
}

/** Given the current tree state, build the request object to pass to
 * {@link loadTreeState} to load updated state. */
export function constructTreeLoadingRequest(
  tree: PlTreeState,
  pruningFunction?: PruningFunction,
  pruningSpec?: PruningSpec,
): TreeLoadingRequest {
  const seedResources: ResourceId[] = [];
  const finalResources = new Set<ResourceId>();
  tree.forEachResource((res) => {
    if (res.finalState) finalResources.add(res.id);
    else seedResources.push(res.id);
  });

  // if tree is empty, seeding tree reconstruction from the specified root
  if (seedResources.length === 0 && finalResources.size === 0) seedResources.push(tree.root);

  return {
    seedResources,
    finalResources,
    pruningFunction,
    root: tree.root,
    pruningSpec,
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

  // Limits the number of concurrent gRPC fetches to bound peak memory
  // from in-flight request/response buffers.
  const limiter = new ConcurrencyLimitingExecutor(100);

  // Promises of resource states, in the order they were requested.
  const pending = new Denque<Promise<ExtendedResourceData | undefined>>();

  // vars to calculate number of roundtrips for stats
  let roundTripToggle: boolean = true;
  let numberOfRoundTrips = 0;

  // tracking resources we already requested or queued
  const requested = new Set<ResourceId>();

  /** Mark a resource for fetching. Deduplicates and respects final-resource set. */
  const requestState = (rid: OptionalResourceId) => {
    if (isNullResourceId(rid) || requested.has(rid)) return;

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

/** Server-side equivalent of {@link loadTreeState}: fetches the pruned
 * subtree rooted at the tree's root in a single gRPC call, skipping any
 * resources the client already knows are final. Requires the server to
 * advertise the "loadSubtree:v1" capability. */
export async function loadTreeStateServerSide(
  tx: PlTransaction,
  loadingRequest: TreeLoadingRequest,
  stats?: TreeLoadingStat,
): Promise<ExtendedResourceData[]> {
  const startTimestamp = Date.now();

  if (stats) {
    stats.requests++;
    // One network round-trip for the whole subtree, regardless of graph depth.
    stats.roundTrips++;
  }

  const nodes = await tx.loadSubtree({
    root: loadingRequest.root,
    knownFinals: loadingRequest.finalResources,
    pruning: loadingRequest.pruningSpec,
    includeKv: true,
  });

  const result: ExtendedResourceData[] = nodes.map((n) => ({ ...n.resource, kv: n.kv }));

  if (stats) {
    for (const r of result) {
      stats.retrievedResources++;
      stats.retrievedFields += r.fields.length;
      stats.retrievedKeyValues += r.kv.length;
      stats.retrievedResourceDataBytes += r.data?.length ?? 0;
      for (const kv of r.kv) stats.retrievedKeyValueBytes += kv.value.length;
    }
    stats.millisSpent += Date.now() - startTimestamp;
  }

  return result;
}

/** Capability token a server must advertise (via
 * {@link PlClient.hasServerCapability}) before {@link loadTreeStateServerSide}
 * may be used. */
export const LoadSubtreeCapability = "loadSubtree:v1" as const;
