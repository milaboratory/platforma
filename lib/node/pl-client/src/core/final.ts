import { ResourceTypeName, ResourceTypePrefix } from "@milaboratories/pl-model-common";
import type { FinalityEntry, FinalResourceDataPredicate } from "./finality";
import { FinalityTable, readyOrDuplicateOrError } from "./finality";
import { isNotNullSignedResourceId, isNullSignedResourceId } from "./types";
export { ResourceTypeName, ResourceTypePrefix };
export type { FinalResourceDataPredicate } from "./finality";
export { readyOrDuplicateOrError } from "./finality";

// The finality tables. Each layer calls a resource final only where the backend never stamps
// it again, with two exceptions every layer accepts:
// - a data-loss error cascade: a stored blob found lost or corrupt lifts an error to the
//   resources built from it (R4);
// - the first duplicate's `hasOriginalListeners` flag on its original: backend-internal, never
//   on the wire (R5).
// A layer adds only the types whose later writes its consumer never observes.

const value = (name: string): FinalityEntry => ({
  match: { name },
  rule: "always",
  why: "a value, written once at creation",
});

const settledAtReady = (name: string, why: string): FinalityEntry => ({
  match: { name },
  rule: "readyOrDuplicateOrError",
  why,
});

const never = (match: FinalityEntry["match"], why: string): FinalityEntry => ({
  match,
  rule: "never",
  why,
});

/** Nothing observable (state, fields, KV) changes after the rule holds, R4 and R5 aside. Safe
 * for any consumer, whatever it prunes. */
export const StrictFinality: FinalityTable = FinalityTable.of("strict", [
  value(ResourceTypeName.JsonObject),
  value(ResourceTypeName.JsonGzObject),
  value(ResourceTypeName.JsonString),
  value(ResourceTypeName.JsonArray),
  value(ResourceTypeName.JsonNumber),
  value(ResourceTypeName.JsonBool),
  value(ResourceTypeName.JsonNull),
  value(ResourceTypeName.JsonErrorTrace),
  value(ResourceTypeName.BContextEnd),
  value(ResourceTypeName.FrontendFromUrl),
  value(ResourceTypeName.FrontendFromFolder),
  value(ResourceTypeName.FrontendFromLocalTgz),
  value(ResourceTypeName.BObjectSpec),
  value(ResourceTypeName.Null),
  value(ResourceTypeName.Binary),
  {
    match: { name: ResourceTypeName.JsonResourceError },
    rule: { custom: (r) => r.type.version === "1" },
    why: "version 1 is a value, written once at creation",
    stopRule: { approx: "always", reason: "a stop rule cannot see the type version" },
  },
  { match: { prefix: ResourceTypePrefix.LS }, rule: "always", why: "no write after creation" },
  {
    match: { prefix: ResourceTypePrefix.WorkingDirectory },
    rule: "always",
    why: "no write after creation",
  },
  {
    match: { prefix: ResourceTypePrefix.StorageSpaceAllocation },
    rule: "always",
    why: "no write after creation",
  },
  ...[
    ResourceTypeName.StdMap,
    ResourceTypeName.StdMapSlash,
    ResourceTypeName.EphStdMap,
    ResourceTypeName.PFrame,
    ResourceTypeName.ParquetChunk,
    ResourceTypeName.BContext,
    ResourceTypeName.BinaryMap,
    ResourceTypeName.BinaryValue,
    ResourceTypeName.BlobMap,
    ResourceTypeName.BResolveSingleNoResult,
    ResourceTypeName.BQueryResult,
    ResourceTypeName.TengoLib,
  ].map((name) => settledAtReady(name, "built and locked in its creating transaction")),
  ...[
    ResourceTypeName.TengoTemplate,
    ResourceTypeName.SoftwareInfo,
    ResourceTypeName.BlockPackCustom,
  ].map((name) => settledAtReady(name, "its only later write is the R5 flag")),
  settledAtReady(
    ResourceTypeName.Dummy,
    "its only later write is R4; it hangs off Blob's incarnation field",
  ),
  {
    match: { prefix: ResourceTypePrefix.PColumnData },
    rule: "readyOrDuplicateOrError",
    why: "built and locked in its creating transaction",
  },
  {
    match: { prefix: ResourceTypePrefix.StreamWorkdir },
    rule: "readyOrDuplicateOrError",
    why: "no write after ready",
    stopRule: {
      approx: "readyOrDuplicateOrError",
      reason:
        "the project tree prunes every field, the resource error included, so the predicate " +
        "cannot see an error the backend's HAS_ERRORS stops on",
    },
  },
  ...[ResourceTypeName.BResolveSingle, ResourceTypeName.BResolveChoice].map(
    (name): FinalityEntry => ({
      match: { name },
      rule: "readyAndAllOutputsFilled",
      why:
        "outputs are locked at creation and filled after ready, never overwritten; accepted " +
        "gap: a later context with more than one match sets an error on a resolver that " +
        "already succeeded",
    }),
  ),
  never({ name: ResourceTypeName.UserProject }, "blocks and fields come and go over its life"),
  never({ name: ResourceTypeName.Projects }, "projects are added and removed"),
  never({ name: ResourceTypeName.ClientRoot }, "its fields are added and removed"),
  ...[
    ResourceTypeName.SharingOutbox,
    ResourceTypeName.SharingState,
    ResourceTypeName.SharedEnvelope,
  ].map((name) => never({ name }, "gains and loses dynamic child fields over its life")),
  never(
    { name: ResourceTypeName.LSProvider },
    "its storage fields are rewritten on a controller restart with a changed storage config",
  ),
  never({ name: ResourceTypeName.Blob }, "its incarnation field is attached or replaced later"),
  never({ name: ResourceTypeName.StreamManager }, "`stream` is reset after an error"),
  never({ prefix: ResourceTypePrefix.Blob }, "its `ctl/file/blobInfo` KV is re-pointed later"),
  never(
    { prefix: ResourceTypePrefix.BlobIndex },
    "a controller restart writes its `ctl/ctlsdk/bootstrapDone` KV",
  ),
  never(
    { prefix: ResourceTypePrefix.BlobUpload },
    "the Reset RPC deletes its `ctl/file/storage/uploadState` KV",
  ),
  never(
    { prefix: ResourceTypePrefix.BlobCopy },
    "a controller bootstrap writes its `ctl/ctlsdk/bootstrapDone` KV after an error",
  ),
  never(
    { name: ResourceTypeName.WorkingDirectory },
    "each consuming run writes its lock KV `internal/locks/lockedBy`",
  ),
]);

/** What the transaction resource cache may keep while an entry stays in its LRU. The cache holds
 * state and fields, never KV, so it adds the types whose only later writes are KV. */
export const CacheFinality: FinalityTable = StrictFinality.extend("cache", [
  {
    match: { prefix: ResourceTypePrefix.Blob },
    rule: "always",
    why:
      "`ctl/file/blobInfo` is re-pointed for the same content: the cache holds no KV, and a " +
      "tree reads only its `sizeBytes`, invariant for the same content",
  },
  {
    match: { prefix: ResourceTypePrefix.BlobIndex },
    rule: "readyAndAllOutputsFilled",
    why: "`ctl/ctlsdk/bootstrapDone` is KV, and nothing reads it",
  },
  {
    match: { prefix: ResourceTypePrefix.BlobUpload },
    rule: "readyAndAllOutputsFilled",
    why: "`ctl/file/storage/uploadState` is KV, and nothing reads it",
  },
  {
    match: { prefix: ResourceTypePrefix.BlobCopy },
    rule: "readyAndAllOutputsFilled",
    why:
      "outputs are locked at creation; the only later write, `ctl/ctlsdk/bootstrapDone` on an " +
      "errored copy, is KV, and nothing reads it",
  },
  {
    match: { name: ResourceTypeName.WorkingDirectory },
    rule: "always",
    why: "the lock KV is backend bookkeeping, and nothing reads it",
  },
]);

function streamSwitchedOrErrored(r: Parameters<FinalResourceDataPredicate>[0]): boolean {
  if (!readyOrDuplicateOrError(r)) return false;
  if (r.fields === undefined) return true;
  if (isNotNullSignedResourceId(r.error)) return true;
  // Fields can be pruned away by the reader: without them nothing proves the switch. The
  // predicate must not throw, since a throw inside a tree update rebuilds the whole tree.
  const downloadable = r.fields.find((f) => f.name === "downloadable");
  const stream = r.fields.find((f) => f.name === "stream");
  if (downloadable === undefined || stream === undefined || isNullSignedResourceId(stream.value))
    return false;
  // The backend has no "final" marker for a stream manager: equal fields mean the controller's
  // success branch has switched `stream` to the downloadable blob.
  return stream.value === downloadable.value;
}

/**
 * The finality of trees, and the default of `PlClient.finalPredicate`: a resource it calls final
 * leaves the refresh seeds, later bodies for it are ignored, and its mutable-state change sources
 * are retired. It adds the types whose later writes tree readers never observe.
 */
export const TreeFinality: FinalityTable = CacheFinality.extend("tree", [
  {
    match: { name: ResourceTypeName.Blob },
    rule: "always",
    why:
      "the incarnation field is replaced later, but tree readers never read Blob's fields (the " +
      "download driver reads a blob by id); the project tree also prunes them",
    requiresPruning: { type: ResourceTypeName.Blob, fields: "all" },
  },
  {
    match: { name: ResourceTypeName.StreamManager },
    rule: { custom: streamSwitchedOrErrored },
    why:
      "after an error `stream` is reset in a later transaction; default traversal raises the " +
      "error before exposing the fields, so only an `ignoreError` read sees `stream`",
    stopRule: {
      approx: "readyOrDuplicateOrError",
      reason: "a stop rule cannot compare two fields, so it stops before `stream` switches",
    },
  },
]);

/** @deprecated use {@link TreeFinality} */
export const DefaultFinalResourceDataPredicate: FinalResourceDataPredicate =
  TreeFinality.predicate();
