import {
  FieldData,
  isNullResourceId,
  OptionalResourceId,
  PlTransaction,
  ResourceId
} from '@milaboratories/pl-client';
import Denque from 'denque';
import { ExtendedResourceData, PlTreeState } from './state';
import { msToHumanReadable } from '@milaboratories/ts-helpers';

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
  pruningFunction?: PruningFunction
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
    millisSpent: 0
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
  stats?: TreeLoadingStat
): Promise<ExtendedResourceData[]> {
  // saving start timestamp to add time spent in this function to the stats at the end of the method
  const startTimestamp = Date.now();

  // counting the request
  if (stats) stats.requests++;

  const { seedResources, finalResources, pruningFunction } = loadingRequest;

  // Main idea of using a queue here is that responses will arrive in the same order as they were
  // sent, so we can only wait for the earliest sent unprocessed response promise at any given moment.
  // In such a way logic become linear without recursion, and at the same time deal with data
  // as soon as it arrives.

  const pending = new Denque<Promise<ExtendedResourceData | undefined>>();

  // vars to calculate number of roundtrips for stats
  let roundTripToggle: boolean = true;
  let numberOfRoundTrips = 0;

  // tracking resources we already requested
  const requested = new Set<ResourceId>();
  const requestState = (rid: OptionalResourceId) => {
    if (isNullResourceId(rid) || requested.has(rid)) return;

    // separate check to collect stats
    if (finalResources.has(rid)) {
      if (stats) stats.finalResourcesSkipped++;
      return;
    }

    // adding the id, so we will not request it's state again if somebody else
    // references the same resource
    requested.add(rid);

    // requesting resource and all kv records
    const resourceData = tx.getResourceDataIfExists(rid, true);
    const kvData = tx.listKeyValuesIfResourceExists(rid);

    // counting round-trip (begin)
    const addRT = roundTripToggle;
    if (roundTripToggle) roundTripToggle = false;

    // pushing combined promise
    pending.push(
      (async () => {
        const [resource, kv] = await Promise.all([resourceData, kvData]);

        // counting round-trip, actually incrementing counter and returning toggle back, so the next request can acquire it
        if (addRT) {
          numberOfRoundTrips++;
          roundTripToggle = true;
        }

        if (resource === undefined) return undefined;

        if (kv === undefined) throw new Error('Inconsistent replies');

        return { ...resource, kv };
      })()
    );
  };

  // sending seed requests
  seedResources.forEach((rid) => requestState(rid));

  const result: ExtendedResourceData[] = [];
  while (true) {
    // taking next pending request
    const nextResourcePromise = pending.shift();
    if (nextResourcePromise === undefined)
      // this means we have no pending requests and traversal is over
      break;

    // at this point we pause and wait for the nest requested resource state to arrive
    let nextResource = await nextResourcePromise;
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

    // continue traversal over the referenced resource
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
