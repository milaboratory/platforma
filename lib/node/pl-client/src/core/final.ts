import { ResourceTypeName, ResourceTypePrefix } from "@milaboratories/pl-model-common";
import type { FinalityEntry, FinalityStopRule, FinalResourceDataPredicate } from "./finality";
import { FinalityTable, readyOrDuplicateOrError } from "./finality";
import { isNotNullSignedResourceId, isNullSignedResourceId } from "./types";
export { ResourceTypeName, ResourceTypePrefix };
export type { FinalResourceDataPredicate } from "./finality";
export { readyOrDuplicateOrError } from "./finality";

// The finality tables, one layer per consumer. Every layer accepts two backend writes after
// final: a data-loss error cascade, lifting the error of a stored blob found lost or corrupt to
// the resources built from it, and the first duplicate's `hasOriginalListeners` flag on its
// original, backend-internal and never on the wire. An entry's `why` names any other write
// it accepts. A layer adds only the types whose later writes its consumer does not observe.

// Where the backend's filter stops earlier than the predicate. An early stop is safe: the
// backend sends a body-less stop marker, and the streaming loader fetches every stopped resource
// it does not hold as final again without stop rules (field filtering and pruning still apply),
// so the predicate decides on the fetched body.
const earlyOnFieldErrors: FinalityStopRule = {
  approx: "readyOrDuplicateOrError",
  reason:
    "HAS_ERRORS is set by an error on any field, the predicate reads the resource error only; " +
    "an early stop is followed up with a plain fetch",
};
const earlyOnFieldErrorsWithOutputs: FinalityStopRule = {
  approx: "readyAndAllOutputsFilled",
  reason:
    "HAS_ERRORS is set by an error on any field, the predicate reads the resource error only; " +
    "ALL_OUTPUTS_FINAL, like the predicate, checks every retained field; an early stop is " +
    "followed up with a plain fetch",
};

const value = (name: string): FinalityEntry => ({
  match: { name },
  rule: "always",
  why: "a value, written once at creation",
});

const settledAtReady = (name: string, why: string): FinalityEntry => ({
  match: { name },
  rule: "readyOrDuplicateOrError",
  why,
  stopRule: earlyOnFieldErrors,
});

const never = (match: FinalityEntry["match"], why: string): FinalityEntry => ({
  match,
  rule: "never",
  why,
});

/** The base layer: nothing observable (state, fields, KV) changes after the rule holds, whatever
 * the consumer prunes. Exceptions: the data-loss error cascade, the `hasOriginalListeners` flag,
 * and the writes its entries name. */
export const StrictFinality: FinalityTable = FinalityTable.of("strict", [
  value(ResourceTypeName.JsonObject),
  value(ResourceTypeName.JsonGzObject),
  value(ResourceTypeName.JsonString),
  value(ResourceTypeName.JsonArray),
  value(ResourceTypeName.JsonNumber),
  value(ResourceTypeName.JsonBool),
  value(ResourceTypeName.JsonNull),
  {
    match: { name: ResourceTypeName.JsonErrorTrace },
    rule: "always",
    why: "an error-trace snapshot, populated and locked in its creating transaction",
  },
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
  ].map((name) =>
    settledAtReady(name, "its inputs are final at ready, and no controller fills it afterwards"),
  ),
  ...[
    ResourceTypeName.TengoTemplate,
    ResourceTypeName.SoftwareInfo,
    ResourceTypeName.BlockPackCustom,
  ].map((name) =>
    settledAtReady(
      name,
      "its only later write is the `hasOriginalListeners` flag its first duplicate sets",
    ),
  ),
  settledAtReady(
    ResourceTypeName.Dummy,
    "its only later write is a data-loss error from the Blob whose incarnation field holds it",
  ),
  {
    match: { prefix: ResourceTypePrefix.PColumnData },
    rule: "readyOrDuplicateOrError",
    why: "its inputs are final at ready, and no controller fills it afterwards",
    stopRule: earlyOnFieldErrors,
  },
  {
    match: { prefix: ResourceTypePrefix.StreamWorkdir },
    rule: "readyOrDuplicateOrError",
    why: "no write after ready",
    stopRule: {
      approx: "readyOrDuplicateOrError",
      reason:
        "HAS_ERRORS is set by an error on any field; on ResourceTree walks the project field " +
        "filter also removes every field, `resourceError` included, before decoding, so the " +
        "predicate cannot see an error the filter stops on; an early stop is followed up with " +
        "a plain fetch",
    },
  },
  {
    match: { name: ResourceTypeName.BResolveSingle },
    rule: "readyAndAllOutputsFilled",
    why:
      "outputs are locked at creation and assigned after ready, never overwritten; one " +
      "exception: a later context with more than one match sets an error on a resolver that " +
      "already succeeded, and a reader holding it final misses that error",
    stopRule: earlyOnFieldErrorsWithOutputs,
  },
  {
    match: { name: ResourceTypeName.BResolveChoice },
    rule: "readyAndAllOutputsFilled",
    why:
      "outputs are locked at creation and point at result maps that are completed and locked " +
      "as resolution finishes",
    stopRule: earlyOnFieldErrorsWithOutputs,
  },
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
    "a controller bootstrap records its `ctl/ctlsdk/bootstrapDone` KV in a separate transaction, which may run after the copy settled",
  ),
  never(
    { name: ResourceTypeName.WorkingDirectory },
    "lock acquisition can write its `internal/locks/lockedBy` KV after creation",
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
    why: "`ctl/ctlsdk/bootstrapDone` is backend bookkeeping KV; no client reads it",
    stopRule: earlyOnFieldErrorsWithOutputs,
  },
  {
    match: { prefix: ResourceTypePrefix.BlobUpload },
    rule: "readyAndAllOutputsFilled",
    why: "`ctl/file/storage/uploadState` is backend bookkeeping KV; no client reads it",
    stopRule: earlyOnFieldErrorsWithOutputs,
  },
  {
    match: { prefix: ResourceTypePrefix.BlobCopy },
    rule: "readyAndAllOutputsFilled",
    why:
      "outputs are locked at creation; the only later write, the bootstrap's " +
      "`ctl/ctlsdk/bootstrapDone`, is backend bookkeeping KV; no client reads it",
    stopRule: earlyOnFieldErrorsWithOutputs,
  },
  {
    match: { name: ResourceTypeName.WorkingDirectory },
    rule: "always",
    why: "the lock KV is backend bookkeeping; no client reads it",
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
  // No backend flag marks the switch: equal non-null fields mean the controller's success branch
  // has switched `stream` to the downloadable blob.
  return stream.value === downloadable.value;
}

/**
 * The finality of trees, and the default of `PlClient.finalPredicate`: a resource it calls final
 * leaves the refresh seeds, later bodies for it are ignored, and its mutable-state change sources
 * are retired. It adds Blob and StreamManager under reader assumptions stated at each entry; a
 * consumer that reads what they exclude passes its own predicate.
 */
export const TreeFinality: FinalityTable = CacheFinality.extend("tree", [
  {
    match: { name: ResourceTypeName.Blob },
    rule: "always",
    why:
      "the incarnation field is replaced later; the project tree prunes Blob's fields, and the " +
      "drivers read a blob by id, never through its fields",
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
