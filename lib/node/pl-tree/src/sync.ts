import {
  FieldData,
  isNullResourceId,
  OptionalResourceId,
  PlTransaction,
  ResourceId
} from '@milaboratory/pl-client-v2';
import Denque from 'denque';
import { ExtendedResourceData, PlTreeState } from './state';

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
    if (res.final) finalResources.add(res.id);
    else seedResources.push(res.id);
  });

  // if tree is empty, seeding tree reconstruction from the specified root
  if (seedResources.length === 0 && finalResources.size === 0) seedResources.push(tree.root);

  return { seedResources, finalResources, pruningFunction };
}

/** Given the transaction (preferably read-only) and loading request, executes
 * the tree traversal algorithm, and collects fresh states of resources
 * to update the tree state. */
export async function loadTreeState(
  tx: PlTransaction,
  loadingRequest: TreeLoadingRequest
): Promise<ExtendedResourceData[]> {
  const { seedResources, finalResources, pruningFunction } = loadingRequest;

  // Main idea of using a queue here is that responses will arrive in the same order as they were
  // sent, so we can only wait for the earliest sent unprocessed response promise at any given moment.
  // In such a way logic become linear without recursion, and at the same time deal with data
  // as soon as it arrives.

  const pending = new Denque<Promise<ExtendedResourceData | undefined>>();

  // tracking resources we already requested
  const requested = new Set<ResourceId>();
  const requestState = (rid: OptionalResourceId) => {
    if (isNullResourceId(rid) || requested.has(rid) || finalResources.has(rid)) return;

    // adding the id, so we will not request it's state again if somebody else
    // references the same resource
    requested.add(rid);

    // requesting resource and all kv records
    const resourceData = tx.getResourceDataIfExists(rid, true);
    const kvData = tx.listKeyValuesIfResourceExists(rid);

    // pushing combined promise
    pending.push(
      (async () => {
        const resource = await resourceData;
        const kv = await kvData;

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

    // apply field pruning, if requested
    if (pruningFunction !== undefined)
      nextResource = { ...nextResource, fields: pruningFunction(nextResource) };

    // continue traversal over the referenced resource
    requestState(nextResource.error);
    for (const field of nextResource.fields) {
      requestState(field.value);
      requestState(field.error);
    }

    // aggregating the state
    result.push(nextResource);
  }

  return result;
}
