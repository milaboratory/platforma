import type { PlTransaction, SignedResourceId } from "@milaboratories/pl-client";
import { isNotNullSignedResourceId } from "@milaboratories/pl-client";
import type { ExtendedResourceData } from "./state";
import { TreeStateUpdateError } from "./state";
import type { TreeLoadingRequest, TreeLoadingStat } from "./sync";
import { collectStatsForResource } from "./sync";

/** Emit everything at or below this depth from a resolution seed, whatever its change token
 * says. It bounds descent as well as emission: under a token the walk otherwise ends at the
 * first unchanged resource (api.proto, changed_since_token), so without this a round returns
 * the seeds alone and a newly attached subtree costs one sequential round trip per level.
 *
 * Deep enough to clear a subtree in one round, which is the trade: real server-side walk and
 * downlink for those levels, against a round trip each at ~1.4s on a slow link. Not free -
 * lower it if resolution rounds ever dominate a poll. */
const RESOLUTION_DEPTH = 32;

/** Every id a body points at. Exactly what `updateFromResourceData` refcounts, and it throws
 * `orphan resource` for any that resolves to nothing. */
function referencesOf(resource: ExtendedResourceData): SignedResourceId[] {
  const refs: SignedResourceId[] = [];
  if (isNotNullSignedResourceId(resource.error)) refs.push(resource.error);
  for (const field of resource.fields) {
    if (isNotNullSignedResourceId(field.value)) refs.push(field.value);
    if (isNotNullSignedResourceId(field.error)) refs.push(field.error);
  }
  return refs;
}

/** Rounds before giving up and rebuilding. Each is a sequential round trip and the rebuild it
 * escalates to is a single one, so this has to stay small: with RESOLUTION_DEPTH clearing a
 * subtree per round, needing more than a few means something is wrong rather than deep. */
const MAX_RESOLUTION_ROUNDS = 3;

/**
 * One delta poll: hand the backend this transaction's change token, take only what is newer.
 *
 * The caller commits the token, and only after the whole batch applies - advancing it past a
 * partial apply loses the dropped resources for good.
 *
 * Removals arrive as a rewrite of the referring resource, never as absence, and the refcount
 * GC does the rest. There is deliberately no periodic full reconcile; the blind spot is a
 * removal under a resource the mirror marked final, which streaming and BFS share.
 */
export async function loadDeltaTreeState(
  tx: PlTransaction,
  loadingRequest: TreeLoadingRequest,
  stats?: TreeLoadingStat,
  logger?: { warn: (msg: string) => void },
): Promise<ExtendedResourceData[]> {
  const {
    seedResources,
    finalResources,
    roots,
    knownResources,
    pruningFunction,
    fieldFilter,
    traverseStopRules,
    changedSinceToken,
  } = loadingRequest;

  // Stop rules are never sent. The backend ignores them under a usable token anyway, but a
  // token-less poll then walks unpruned where streaming would have pruned. Sending them only
  // when the token is absent would change the request shape between polls, which a token
  // holder must not do - so the cost is warned about instead.
  if (traverseStopRules !== undefined && changedSinceToken === undefined) {
    logger?.warn(
      "delta poll: traverseStopRules supplied but not sent, and this poll carries no token," +
        " so the backend walk is unpruned where the streaming path would have pruned it",
    );
  }

  // Seed at every non-final resource, not the roots. Required, not an optimisation: the
  // backend ends a walk at the first unchanged resource, so a root-seeded poll never reaches a
  // change under a quiet parent - measured at 0 of 3 changes delivered. algorithm_equivalence
  // fails on its KV step if this is ever narrowed back to the roots.
  //
  // The seed set changes every poll and the token is deliberately NOT discarded for it, though
  // api.proto counts it as a shape input. Safe because every seed is a resource the mirror
  // already holds, so a change can only widen the result, and widening hides nothing.
  // Discarding per poll would make every poll a full read and defeat the mechanism.
  //
  // The roots stand in when the frontier is empty: resourceTree needs at least one seed.
  const seeds = seedResources.length > 0 ? seedResources : [...roots];
  if (seeds.length === 0) return [];

  const collected = new Map<SignedResourceId, ExtendedResourceData>();
  // References neither the mirror nor this batch can satisfy; applying with one outstanding
  // invalidates the whole tree. Maintained incrementally as frames arrive: rescanning
  // everything collected once per round would be quadratic in a poll that needs several.
  const missing = new Set<SignedResourceId>();
  // Same ids, in arrival order, so a round consumes only what is new rather than walking the
  // whole set. An id enters both exactly once: `collected` is checked before the add and never
  // cleared, so nothing re-enters after it resolves.
  const pending: SignedResourceId[] = [];
  const collect = (resource: ExtendedResourceData) => {
    collected.set(resource.id, resource);
    missing.delete(resource.id);
    for (const ref of referencesOf(resource))
      if (!collected.has(ref) && !knownResources.has(ref) && !missing.has(ref)) {
        missing.add(ref);
        pending.push(ref);
      }
  };

  const consume = async (walkSeeds: SignedResourceId[], unconditionalDepth?: number) => {
    if (stats) {
      stats.roundTrips++;
      stats.streamRounds++;
      stats.deltaSeedsSent += walkSeeds.length;
    }

    for await (const frame of tx.resourceTree(walkSeeds, {
      includeKv: true,
      fieldFilter,
      changedSinceToken,
      unconditionalDepth,
    })) {
      // We send no stop rules, so the server cannot emit one (api.proto: traverse_was_stopped
      // is always false when traverse_stop_rules was absent).
      if (frame.frameKind === "stopMarker") continue;

      if (stats) stats.resourceFrames++;

      // updateFromResourceData throws on any body for a held final resource and invalidates
      // the tree. A token-less poll walks unpruned and emits exactly those, which is what the
      // first poll after a restored snapshot does. Both sibling algorithms skip the same way.
      // Safe for references: finalResources is a subset of knownResources.
      if (finalResources.has(frame.id)) {
        if (stats) stats.finalResourcesSkipped++;
        continue;
      }

      // An explicit literal rather than two rest-spreads of the frame. Measured ~15% off the
      // per-frame cost: a spread copies every property twice and gives the object a hidden
      // class of its own, where this is the shape the streaming path already produces.
      const resource: ExtendedResourceData = {
        id: frame.id,
        type: frame.type,
        kind: frame.kind,
        data: frame.data,
        resourceReady: frame.resourceReady,
        error: frame.error,
        originalResourceId: frame.originalResourceId,
        final: frame.final,
        inputsLocked: frame.inputsLocked,
        outputsLocked: frame.outputsLocked,
        fields:
          pruningFunction !== undefined
            ? pruningFunction(frame as unknown as ExtendedResourceData)
            : frame.fields,
        kv: frame.kv,
      };
      if (stats) stats.prunedFields += frame.fields.length - resource.fields.length;

      collect(resource);
      collectStatsForResource(resource, stats);
    }
  };

  await consume(seeds);

  // Captured before the resolution rounds. They fetch unconditionally by design, so counting
  // afterwards lets a modest unheld subtree inflate the total past a small mirror and report a
  // refused token that was never refused.
  const collectedFromPoll = collected.size;

  // A body may reference a resource the response did not carry - a field repointed at one we
  // never held. Ids already asked for are never re-requested, so the loop terminates: the id
  // set is finite and each round removes at least one.
  const fetched = new Set<SignedResourceId>();
  let rounds = 0;
  while (missing.size > 0) {
    if (++rounds > MAX_RESOLUTION_ROUNDS) {
      throw new TreeStateUpdateError(
        `delta poll: ${missing.size} reference(s) still unresolved after ${MAX_RESOLUTION_ROUNDS} rounds`,
      );
    }

    const round = pending.splice(0).filter((id) => !fetched.has(id) && missing.has(id));
    if (round.length === 0) {
      // Asked for all of these and none arrived; a soft-deleted referent gets here, since
      // those frames are dropped client-side. TreeStateUpdateError specifically: the poll loop
      // rebuilds and discards the token for that class, where a plain Error is only logged and
      // the identical request fails forever.
      throw new TreeStateUpdateError(
        `delta poll: ${missing.size} referenced resource(s) could not be resolved, first ${missing.values().next().value}`,
      );
    }
    for (const id of round) fetched.add(id);

    if (stats) stats.deltaResolutionRounds++;
    await consume(round, RESOLUTION_DEPTH);
  }

  // A refused token is answered with the full tree and no error, so this is the only tell.
  // Reported, not acted on: the response is a correct superset, and the token stored after
  // this poll comes from the current instance, so it self-heals next poll.
  if (
    changedSinceToken !== undefined &&
    knownResources.size > 0 &&
    collectedFromPoll >= knownResources.size
  ) {
    if (stats) stats.deltaSuspectedFullAnswers++;
    logger?.warn(
      `delta poll: sent a token but received ${collectedFromPoll} resources against a mirror of ` +
        `${knownResources.size}; the backend may have refused the token (instance change or ` +
        `rewound numbering), in which case this poll cost a full tree read`,
    );
  }

  return [...collected.values()];
}
