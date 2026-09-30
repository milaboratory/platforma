import type { Optional } from "utility-types";
import type { BasicResourceData, ResourceData } from "./types";
import { isNotNullSignedResourceId, isNullSignedResourceId } from "./types";
import { ResourceTypeName, ResourceTypePrefix } from "@milaboratories/pl-model-common";
export { ResourceTypeName, ResourceTypePrefix };

/**
 * Tells whether a resource state is final: whether it will never change as long as the resource
 * exists. Two layers act on the answer, each through its own predicate built from one table:
 * the tree ({@link DefaultFinalResourceDataPredicate}) and the transaction resource cache
 * ({@link DefaultResourceCachePredicate}).
 *
 * **The rule.** Final means the resource is never stamped again (its change token never moves),
 * with two exceptions:
 * - a data-loss error cascade: a stored blob found lost or corrupt lifts an error to the resources
 *   built from it, after they were final (R4, ruled out of scope);
 * - the first duplicate's `hasOriginalListeners` flag on its original: backend-internal, never on
 *   the wire (R5, exempt).
 *
 * The table below also keeps a few types final although the backend writes to them after the
 * final condition holds. Each such case says, where it is listed, what is written and why the
 * tree does not care.
 *
 * If the data carries no fields (`fields` undefined), the answer is about the basic part of the
 * resource data only.
 */
export type FinalResourceDataPredicate = (
  resourceData: Optional<ResourceData, "fields">,
) => boolean;

export function readyOrDuplicateOrError(r: ResourceData | BasicResourceData): boolean {
  return (
    r.resourceReady ||
    isNotNullSignedResourceId(r.originalResourceId) ||
    isNotNullSignedResourceId(r.error)
  );
}

function readyAndHasAllOutputsFilled(r: Optional<ResourceData, "fields">): boolean {
  if (!readyOrDuplicateOrError(r)) return false;
  if (!r.outputsLocked) return false;
  if (r.fields === undefined) return true; // if fields are not provided basic resource state is not expected to change in the future
  for (const f of r.fields)
    if (isNullSignedResourceId(f.error) && (isNullSignedResourceId(f.value) || !f.valueIsFinal))
      return false;
  return true;
}

// solely for logging
const unknownResourceTypeNames = new Set<string>();

/**
 * The tree's finality predicate for built-in resource types. A resource it calls final is no
 * longer seeded or re-read by `pl-tree`, and its change sources are dropped: the tree trusts it
 * never to change in state, fields or KV (see {@link FinalResourceDataPredicate} for the rule
 * and its exceptions).
 */
export const DefaultFinalResourceDataPredicate: FinalResourceDataPredicate = (r): boolean => {
  switch (r.type.name) {
    case ResourceTypeName.StreamManager: {
      // Intended exception: on an input error the controller resets `stream` in a later
      // transaction, after the error made the manager final here. Readers of an errored manager
      // take the error path and never read `stream`.
      if (!readyOrDuplicateOrError(r)) return false;
      if (r.fields === undefined) return true; // if fields are not provided basic resource state is not expected to change in the future
      if (isNotNullSignedResourceId(r.error)) return true;
      // Fields can be pruned away by the reader: without them nothing proves the switch, so
      // the resource is not final. The predicate must not throw, since a throw inside the
      // tree's update invalidates and rebuilds the whole tree.
      const downloadable = r.fields.find((f) => f.name === "downloadable");
      const stream = r.fields.find((f) => f.name === "stream");
      // Both still empty is not a switch either.
      if (
        downloadable === undefined ||
        stream === undefined ||
        isNullSignedResourceId(stream.value)
      )
        return false;
      // The backend has no "final" marker for a stream manager: equal fields only mean the
      // controller's success branch has switched `stream` to the downloadable blob.
      return stream.value === downloadable.value;
    }
    case ResourceTypeName.Dummy:
    // Intended exception: its only later write is the data-loss error cascade (R4). It hangs
    // off Blob's pruned incarnation field, so no tree holds it.
    case ResourceTypeName.StdMap:
    case ResourceTypeName.StdMapSlash:
    case ResourceTypeName.EphStdMap:
    case ResourceTypeName.PFrame:
    case ResourceTypeName.ParquetChunk:
    case ResourceTypeName.BContext:
    case ResourceTypeName.BlockPackCustom:
    case ResourceTypeName.BinaryMap:
    case ResourceTypeName.BinaryValue:
    case ResourceTypeName.BlobMap:
    case ResourceTypeName.BResolveSingleNoResult:
    case ResourceTypeName.BQueryResult:
    case ResourceTypeName.TengoTemplate:
    case ResourceTypeName.TengoLib:
    case ResourceTypeName.SoftwareInfo:
      return readyOrDuplicateOrError(r);
    case ResourceTypeName.JsonResourceError:
      return r.type.version === "1";
    case ResourceTypeName.Blob:
    // Intended exception: the incarnation field is attached or replaced later, and a
    // `ctl/file/blob-meta` KV may be rewritten by the controller bootstrap. Every tree prunes
    // Blob's fields, and nothing reads blob-meta.
    case ResourceTypeName.WorkingDirectory:
    // Intended exception: each consuming run writes the lock KV `internal/locks/lockedBy`. No
    // tree holds a WorkingDirectory (reachable only through pruned StreamWorkdir fields).
    case ResourceTypeName.JsonObject:
    case ResourceTypeName.JsonGzObject:
    case ResourceTypeName.JsonString:
    case ResourceTypeName.JsonArray:
    case ResourceTypeName.JsonNumber:
    case ResourceTypeName.JsonBool:
    case ResourceTypeName.JsonNull:
    case ResourceTypeName.JsonErrorTrace:
    case ResourceTypeName.BContextEnd:
    case ResourceTypeName.FrontendFromUrl:
    case ResourceTypeName.FrontendFromFolder:
    case ResourceTypeName.FrontendFromLocalTgz:
    case ResourceTypeName.BObjectSpec:
    case ResourceTypeName.Null:
    case ResourceTypeName.Binary:
      return true;
    case ResourceTypeName.UserProject:
    case ResourceTypeName.Projects:
    case ResourceTypeName.ClientRoot:
    // Never final — these sharing resources gain and lose dynamic child fields over their lifetime.
    case ResourceTypeName.SharingOutbox:
    case ResourceTypeName.SharingState:
    case ResourceTypeName.SharedEnvelope:
    // The context resolver fills the outputs after ready, and never locks them on success.
    case ResourceTypeName.BResolveSingle:
    case ResourceTypeName.BResolveChoice:
    // Its storage fields are rewritten on a controller restart with a changed storage config.
    case ResourceTypeName.LSProvider:
      return false;
    default:
      if (r.type.name.startsWith(ResourceTypePrefix.Blob)) {
        // Intended exception: the `ctl/file/blobInfo` KV is re-pointed when identical content
        // is uploaded again or an archive is healed. It describes the same content, and the
        // client reads only its `sizeBytes`.
        return true;
      } else if (
        r.type.name.startsWith(ResourceTypePrefix.LS) ||
        r.type.name.startsWith(ResourceTypePrefix.WorkingDirectory) ||
        r.type.name.startsWith(ResourceTypePrefix.StorageSpaceAllocation)
      ) {
        return true;
      } else if (r.type.name.startsWith(ResourceTypePrefix.BlobUpload)) {
        // Intended exception: the Reset RPC deletes the `ctl/file/storage/uploadState` KV
        // without checking that the upload finished. Only server-side callers use it, before
        // finalize, and nothing reads the key.
        return readyAndHasAllOutputsFilled(r);
      } else if (r.type.name.startsWith(ResourceTypePrefix.BlobIndex)) {
        // Intended exception: every storage-controller restart writes the bootstrap mark KV
        // `ctl/ctlsdk/bootstrapDone` on each ready index. Nothing reads it.
        return readyAndHasAllOutputsFilled(r);
      } else if (r.type.name.startsWith(ResourceTypePrefix.PColumnData)) {
        return readyOrDuplicateOrError(r);
      } else if (r.type.name.startsWith(ResourceTypePrefix.StreamWorkdir)) {
        return readyOrDuplicateOrError(r);
      } else {
        // Unknown resource type detected, never final. BlobCopy/* lands here on purpose: nothing
        // locks its outputs, so readyAndHasAllOutputsFilled would never hold for it either.
        // Set used to log this message only once
        if (!unknownResourceTypeNames.has(r.type.name)) {
          console.log("UNKNOWN RESOURCE TYPE: " + r.type.name);
          unknownResourceTypeNames.add(r.type.name);
        }
      }
  }
  return false;
};

/** Types the tree may hold as final whose state or fields still change later. The resource
 * cache keeps state and fields (never KV), so it must not keep these. */
const FieldsChangeAfterFinal: ReadonlySet<string> = new Set([
  // the incarnation field is attached or replaced after creation
  ResourceTypeName.Blob,
  // `stream` is reset after an error made it final
  ResourceTypeName.StreamManager,
]);

/**
 * The transaction resource cache's predicate derived from a tree predicate: final for the tree,
 * and not a type whose state or fields change after that. A resource it accepts is served from
 * the cache for the life of the client. The cache never holds KV, so a type whose only later
 * writes are KV stays cacheable.
 */
export function resourceCachePredicate(
  treePredicate: FinalResourceDataPredicate,
): FinalResourceDataPredicate {
  return (r) => !FieldsChangeAfterFinal.has(r.type.name) && treePredicate(r);
}

/** {@link resourceCachePredicate} of {@link DefaultFinalResourceDataPredicate}. */
export const DefaultResourceCachePredicate: FinalResourceDataPredicate = resourceCachePredicate(
  DefaultFinalResourceDataPredicate,
);
