import { isNullResourceId, OptionalResourceId, PlClient, ResourceData, ResourceId } from '@milaboratory/pl-client-v2';
import Denque from 'denque';

/**
 * @param client ta client to request state from
 * @param seedResources should not contain elements from final resource
 * @param finalResources resource ids for which state is already known and not expected to change,
 *                       so we should not continue traversal via them
 * @param [txName='load-tree'] transaction name to use
 * */
export async function loadTreeState(client: PlClient,
                                    seedResources: Set<ResourceId>,
                                    finalResources: Set<ResourceId>,
                                    txName: string = 'load-tree'): Promise<ResourceData[]> {
  return await client.withReadTx(txName, async tx => {

    // Main idea of using a queue here is that responses will arrive in the same order as they were
    // sent, so we can only wait for the earliest sent unprocessed response promise at any given moment.
    // In such a way logic become linear without recursion, and at the same time deal with data
    // as soon as it arrives

    const pending = new Denque<Promise<ResourceData>>();

    // sending seed requests
    seedResources.forEach(rid => {
      pending.push(tx.getResourceData(rid, true));
    });

    // initialized with seed, because we just request them above
    const requested = new Set<ResourceId>(seedResources);

    const sendRequestFor = (rid: OptionalResourceId) => {
      if (isNullResourceId(rid) || requested.has(rid) || finalResources.has(rid))
        return;
      // adding the id, so we will not request it's state again if somebody else
      // references the same resource
      requested.add(rid);
      // sending the request
      pending.push(tx.getResourceData(rid, true));
    };

    const result: ResourceData[] = [];
    while (true) {
      // taking next pending request
      const nextResourcePromise = pending.shift();
      if (nextResourcePromise === undefined)
        // this means we have no pending requests and traversal is over
        break;

      // at this point we pause and wait for the nest requested resource state to arrive
      const nextResource = await nextResourcePromise;

      // continue traversal over referenced resource
      sendRequestFor(nextResource.error);
      for (const field of nextResource.fields) {
        sendRequestFor(field.value);
        sendRequestFor(field.error);
      }

      // aggregating the state
      result.push(nextResource);
    }

    return result;
  });
}

// // Helpers
// export async function loadResourcesClosure(
//   tx: Transaction,
//   rIds: ResourceId[]
// ): Promise<PlGrpc.PlResource[]> {
//   const allRIds: Set<bigint> = new Set();
//   const allResources: PlGrpc.PlResource[] = [];
//
//   const resourceNeighbours = (r: PlGrpc.PlResource) =>
//     r.fields
//       .flatMap((f) => [f.value, f.error])
//       .filter((rId) => rId != undefined && rId > 0);
//
//   let rIdsToAdd = rIds;
//   while (true) {
//     const resources = await loadResources(tx, rIdsToAdd);
//     resources.forEach((r) => allResources.push(r));
//     resources.forEach((r) => allRIds.add(r.id));
//     const fieldVals = resources.flatMap(resourceNeighbours);
//     rIdsToAdd = fieldVals.filter((rId) => !allRIds.has(rId));
//     if (rIdsToAdd.length == 0) break;
//   }
//
//   return allResources;
// }
//
// export async function loadResources(
//   tx: Transaction,
//   rIds: ResourceId[]
// ): Promise<PlGrpc.PlResource[]> {
//   return Promise.all(
//     rIds.map(async (rId: ResourceId) => tx.getResource(rId))
//   );
// }
//
//
// async loadAndUpdate() {
//   if (!this.client) throw new Error('client is undefined');
//
//   const rIds =
//     this.resources.size > 0
//       ? mapEntries(this.resources).map(([rId, _]) => rId)
//       : [this.root];
//
//   const protoResources = await this.client.readableTx(
//     async (tx: Transaction) => loadResourcesClosure(tx, rIds),
//     'TreeDriverReadResources'
//   );
//   const resources = protoResources.map(protoToResource);
//   this.updateFromResourceData(resources);
// }
