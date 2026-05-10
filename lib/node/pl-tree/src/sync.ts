import type {
  FieldData,
  Filter,
  OptionalSignedResourceId,
  PlTransaction,
  SignedResourceId,
} from "@milaboratories/pl-client";
import Denque from "denque";
import { isNullSignedResourceId } from "@milaboratories/pl-client";
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

  /** ResourceTree field filters passed to the backend when supported. */
  readonly fieldFilters?: Filter[];

  /** ResourceTree traversal stop rules passed to the backend when supported. */
  readonly traverseStopRules?: Filter;
}

const CapabilityTreeFilter = "treeFilter:v1";

/** Given the current tree state, build the request object to pass to
 * {@link loadTreeState} to load updated state. */
export function constructTreeLoadingRequest(
  tree: PlTreeState,
  options: Pick<TreeLoadingRequest, "pruningFunction" | "fieldFilters" | "traverseStopRules"> = {},
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
    fieldFilters: options.fieldFilters,
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

  const limiter = new ConcurrencyLimitingExecutor(100);
  const pending = new Denque<Promise<ExtendedResourceData | undefined>>();

  let roundTripToggle = true;
  let numberOfRoundTrips = 0;

  const requested = new Set<SignedResourceId>();

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

        const addRT = roundTripToggle;
        if (roundTripToggle) roundTripToggle = false;

        const [resource, kv] = await Promise.all([resourceData, kvData]);

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

  seedResources.forEach((rid) => requestState(rid));

  const result: ExtendedResourceData[] = [];
  let nextPromise: Promise<ExtendedResourceData | undefined> | undefined;
  while ((nextPromise = pending.shift()) !== undefined) {
    let nextResource = await nextPromise;
    if (nextResource === undefined) continue;

    if (pruningFunction !== undefined) {
      const fieldsAfterPruning = pruningFunction(nextResource);
      if (stats) stats.prunedFields += nextResource.fields.length - fieldsAfterPruning.length;
      nextResource = { ...nextResource, fields: fieldsAfterPruning };
    }

    requestState(nextResource.error);
    for (const field of nextResource.fields) {
      requestState(field.value);
      requestState(field.error);
    }

    collectStatsForResource(nextResource, stats);
    result.push(nextResource);
  }

  if (stats) stats.roundTrips += numberOfRoundTrips;

  return result;
}

async function loadTreeStateViaResourceTree(
  tx: PlTransaction,
  loadingRequest: TreeLoadingRequest,
  stats?: TreeLoadingStat,
): Promise<ExtendedResourceData[]> {
  const { seedResources, finalResources, pruningFunction, fieldFilters, traverseStopRules } =
    loadingRequest;

  const result: ExtendedResourceData[] = [];

  const treeItems = (tx as any).resourceTree(seedResources, {
    includeKv: true,
    fieldFilters,
    traverseStopRules,
  }) as AsyncIterable<ExtendedResourceData & { traverseWasStopped: boolean }>;

  // ResourceTree yields incrementally; this loop consumes stream frames one by one.
  for await (const item of treeItems) {
    if (finalResources.has(item.id)) {
      if (stats) stats.finalResourcesSkipped++;
      continue;
    }

    let nextResource: ExtendedResourceData = {
      id: item.id,
      type: item.type,
      kind: item.kind,
      data: item.data,
      resourceReady: item.resourceReady,
      error: item.error,
      originalResourceId: item.originalResourceId,
      // traverseWasStopped means backend matched traverse stop rules for this node.
      // We propagate this into `final` so the tree can treat this node as terminal.
      final: item.final || item.traverseWasStopped,
      inputsLocked: item.inputsLocked,
      outputsLocked: item.outputsLocked,
      fields: item.fields,
      kv: item.kv,
      traverseWasStopped: item.traverseWasStopped,
    };

    if (pruningFunction !== undefined) {
      const fieldsAfterPruning = pruningFunction(nextResource);
      if (stats) stats.prunedFields += nextResource.fields.length - fieldsAfterPruning.length;
      nextResource = { ...nextResource, fields: fieldsAfterPruning };
    }

    collectStatsForResource(nextResource, stats);
    result.push(nextResource);
  }

  if (stats) stats.roundTrips++;

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
): Promise<ExtendedResourceData[]> {
  const startTimestamp = Date.now();
  if (stats) stats.requests++;

  try {
    if (supportsResourceTreeTraversal(capabilities)) {
      return await loadTreeStateViaResourceTree(tx, loadingRequest, stats);
    }

    return await loadTreeStateViaBfs(tx, loadingRequest, stats);
  } finally {
    if (stats) stats.millisSpent += Date.now() - startTimestamp;
  }
}
