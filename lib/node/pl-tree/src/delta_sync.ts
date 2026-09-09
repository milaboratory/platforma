import type { PlTransaction, SignedResourceId } from "@milaboratories/pl-client";
import { isNotNullSignedResourceId } from "@milaboratories/pl-client";
import type { ExtendedResourceData } from "./state";
import { TreeStateUpdateError } from "./state";
import type { TreeLoadingRequest, TreeLoadingStat } from "./sync";

/**
 * Seed the delta walk at every non-final resource the mirror holds, rather than at the roots
 * alone.
 *
 * On is the sound setting. The backend ends a delta walk at the first unchanged resource on
 * each branch, and a resource gaining fields or taking a KV write does not rewrite its
 * parent, so a root-seeded poll does not see a change under a quiet parent until something on
 * the path down to it changes too. Seeding the non-final frontier makes such a resource its
 * own seed, so nothing is hidden.
 *
 * Off is cheaper per poll and exists to price that: it is what the benchmark flips. It is a
 * const rather than an option because both settings shape the request, and the change token
 * carries no request shape, so a tree may not change its mind mid-life without discarding the
 * token it holds.
 *
 * `PL_TREE_NO_FINALISATION=1` turns it off for a whole process. That exists so the benchmark
 * can run the other arm without threading an option through the API, and is read once here at
 * module load, which is what keeps it immutable for every tree in the process.
 */
const USE_FINALISATION = process.env.PL_TREE_NO_FINALISATION !== "1";

/** Depth used by a resolution round. 0 takes the named seeds and nothing below them, which is
 * the least the apply invariant needs: a body may reference resources the delta did not carry,
 * and those references have to resolve to something the mirror holds. Their own children are
 * still subject to the token, so a round can surface further unknowns, which the loop picks
 * up. */
const RESOLUTION_DEPTH = 0;

/** Every resource id a body points at: its error, and each field's value and error. These are
 * exactly the references {@link PlTreeState.updateFromResourceData} increments a refcount for,
 * and it throws `orphan resource` for any that resolves to nothing. */
function referencesOf(resource: ExtendedResourceData): SignedResourceId[] {
  const refs: SignedResourceId[] = [];
  if (isNotNullSignedResourceId(resource.error)) refs.push(resource.error);
  for (const field of resource.fields) {
    if (isNotNullSignedResourceId(field.value)) refs.push(field.value);
    if (isNotNullSignedResourceId(field.error)) refs.push(field.error);
  }
  return refs;
}

/** Ids referenced by what we collected that neither the mirror nor this batch can satisfy.
 * Applying the batch while one of these is outstanding invalidates the whole tree. */
function unresolvedReferences(
  collected: Map<SignedResourceId, ExtendedResourceData>,
  known: ReadonlySet<SignedResourceId>,
): SignedResourceId[] {
  const missing = new Set<SignedResourceId>();
  for (const resource of collected.values())
    for (const ref of referencesOf(resource))
      if (!collected.has(ref) && !known.has(ref)) missing.add(ref);
  return [...missing];
}

/**
 * One delta poll: hand the backend the token this transaction was opened at and take only the
 * resources whose own change token is newer.
 *
 * The token is NOT committed here. It belongs to the caller, which stores it only after a
 * whole batch has applied successfully: kept after a partial apply, the resources that were
 * dropped are never sent again.
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
    changedSinceToken,
  } = loadingRequest;

  // With finalisation off the roots are the only entry point. With it on the frontier is, and
  // the roots stand in when it is empty: a tree whose every resource is final still has to
  // hand resourceTree at least one seed.
  const frontier = USE_FINALISATION ? seedResources : [];
  const seeds = frontier.length > 0 ? frontier : [...roots];
  if (seeds.length === 0) return [];

  const collected = new Map<SignedResourceId, ExtendedResourceData>();

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
      // Cannot arrive under a token: stop rules do not apply to a delta walk, and an
      // unchanged resource produces no frame at all rather than a body-less one.
      if (frame.frameKind === "stopMarker") {
        if (stats) stats.stopMarkerFrames++;
        logger?.warn(
          `delta poll: unexpected stop-marker frame for ${frame.id}; ignoring. A delta walk should not produce one.`,
        );
        continue;
      }

      if (stats) {
        stats.resourceFrames++;
        if (frame.traverseWasStopped) stats.traverseWasStoppedCount++;
      }

      // A held final resource can never be updated again: updateFromResourceData throws on any
      // body for one, changed or not, and invalidates the whole tree. A token-less poll is a
      // full walk with no stop rules, so it emits exactly those bodies for every final
      // resource under a non-final seed - which is what the first poll after a restored
      // snapshot, or after a token discard, does. Both sibling algorithms skip the same way.
      //
      // Safe for the reference invariant: finalResources is a subset of knownResources, so a
      // reference pointing at a skipped resource is still satisfied, and dropping it from the
      // batch drops its own outgoing requirements with it.
      if (finalResources.has(frame.id)) {
        if (stats) stats.finalResourcesSkipped++;
        continue;
      }

      // A "resource" frame is already an ExtendedResourceData plus the frame discriminants,
      // so the payload needs no reassembly - only field pruning.
      const { frameKind: _frameKind, traverseWasStopped: _stopped, ...resource } = frame;
      const fields = pruningFunction !== undefined ? pruningFunction(resource) : resource.fields;
      if (stats) stats.prunedFields += resource.fields.length - fields.length;

      const pruned: ExtendedResourceData = { ...resource, fields };
      collected.set(pruned.id, pruned);

      if (stats) {
        stats.retrievedResources++;
        stats.retrievedFields += fields.length;
        stats.retrievedKeyValues += pruned.kv.length;
        stats.retrievedResourceDataBytes += pruned.data?.length ?? 0;
        for (const kv of pruned.kv) stats.retrievedKeyValueBytes += kv.value.length;
      }
    }
  };

  await consume(seeds);

  // Resolution rounds. A delta body may point at a resource the response did not carry - a
  // field repointed at an older resource we never held, or a subtree the walk newly reaches -
  // and the apply refuses to run with such a reference outstanding. Ids already fetched are
  // never re-requested, so a diamond or a shared reference cannot loop forever: the id set is
  // finite and each round removes at least one from it.
  const fetched = new Set<SignedResourceId>();
  let unresolved = unresolvedReferences(collected, knownResources);
  while (unresolved.length > 0) {
    const round = unresolved.filter((id) => !fetched.has(id));
    if (round.length === 0) {
      // Asked for every one of these already and they did not arrive: the ids exist in a
      // reference but the backend will not serve them under this token. Applying anyway
      // invalidates the tree, so fail here with the ids rather than there without them.
      //
      // TreeStateUpdateError rather than a plain Error on purpose: the poll loop rebuilds the
      // mirror and discards the token for that class, and re-reads from scratch. A plain Error
      // only gets logged, leaving the token and the seed set identical, so the very same
      // reference fails on every subsequent poll and the tree never updates again. A
      // soft-deleted referent reaches here, since those frames are dropped client-side.
      throw new TreeStateUpdateError(
        `delta poll: ${unresolved.length} referenced resource(s) could not be resolved, first ${unresolved[0]}`,
      );
    }
    for (const id of round) fetched.add(id);

    if (stats) stats.deltaResolutionRounds++;
    await consume(round, RESOLUTION_DEPTH);

    unresolved = unresolvedReferences(collected, knownResources);
  }

  return [...collected.values()];
}
