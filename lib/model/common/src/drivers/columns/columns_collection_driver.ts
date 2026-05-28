import type { Branded } from "../../branding";
import type { PoolEntry } from "../../pool_entry";
import type { AccessorHandle, AccessorLike, UpstreamBlockCtx } from "../../columns/types";
import type { ColumnUniversalId } from "../pframe/spec/ids";
import type { ColumnsDiscoverOptions, ColumnsFilterOptions } from "./discover_columns_options";
import type { PFrameSpecDriver } from "../pframe/spec_driver";
import type { PColumnSpec } from "../pframe/spec/spec";
import type { PObjectId } from "../../pool";

/**
 * Opaque host-owned handle for a `ColumnsCollection` instance. Issued by
 * {@link ColumnsCollectionDriver.create}, refcounted by the driver, and
 * pinned to the active render ctx via the VM injector — sandbox never
 * sees raw refcounting.
 */
export type CollectionHandle = Branded<string, "CollectionHandle">;

/**
 * JSON descriptor crossing the VM bridge in place of a sandbox
 * `ColumnsSource`. Always plain data — no closures, no class instances.
 *
 * - `"collection"`  – reference another driver-managed collection by handle
 *   (chaining, splicing).
 * - `"result_pool"` – fan-out into the host's current render ctx upstream
 *   block ctxes. Carries no payload — the host always uses its own pool.
 * - `"accessor"`    – walk the host tree starting at the given accessor
 *   handle from a `path` prefix.
 * - `"ids"`         – pre-resolved id list (sandbox-materialised provider).
 */
export type SerializedColumnsSource =
  | { readonly kind: "collection"; readonly handle: CollectionHandle }
  | { readonly kind: "result_pool" }
  | { readonly kind: "accessor"; readonly accessor: AccessorHandle; readonly path: string[] }
  | { readonly kind: "ids"; readonly ids: ColumnUniversalId[]; readonly isFinal: boolean };

/**
 * Per-call host bindings the driver needs to resolve sources whose
 * shape references render-ctx state (`"accessor"`, `"result_pool"`).
 *
 * The VM injector inside `pl-middle-layer` supplies these on every call;
 * UI-side direct callers that only build collections out of `"ids"` /
 * `"collection"` sources may omit the bindings entirely.
 *
 * Parameterised on the concrete accessor flavour so host implementations
 * keep their static types (e.g. `PlTreeNodeAccessor`) without leaking that
 * dependency into `@milaboratories/pl-model-common`.
 */
export interface ColumnsCollectionDriverHost<A extends AccessorLike<A> = AccessorLike<any>> {
  /** Resolve an {@link AccessorHandle} to the host's concrete accessor. */
  resolveAccessor(handle: AccessorHandle): A;

  /** Snapshot of upstream-block ctx pairs from the current render ctx. */
  getUpstreamBlockCtxes(): ReadonlyArray<UpstreamBlockCtx<A>>;

  /**
   * Per-call spec driver. The injector supplies the active render ctx's
   * `PFrameSpec` service; `discover` / `filter` use it to build a spec
   * frame and run a single discovery query.
   */
  getSpecDriver(): PFrameSpecDriver;

  /**
   * Resolve the canonical {@link PColumnSpec} for a leaf {@link PObjectId}.
   * Returns `undefined` when the id is not present in the active registry
   * (e.g. handed to the driver via a `{kind:"ids"}` source whose underlying
   * column has since left the visible scope). Override-wrapped ids are
   * unwrapped by the caller — this method only resolves the underlying leaf.
   */
  resolveSpec(id: PObjectId): PColumnSpec | undefined;
}

/**
 * Sandbox / UI view of the `ColumnsCollection` driver. Same methods as
 * {@link ColumnsCollectionDriver}, but the `host` parameters are dropped —
 * the VM bridge / UI wrapper supplies them on every call so callers only
 * pass plain data (handles + source descriptors + option objects).
 *
 * `getService("columnsCollection")` returns a value of this shape on both
 * sandbox and UI sides.
 */
export interface ColumnsCollectionDriverModel {
  /** Build a fresh collection from the supplied source descriptors. */
  create(sources: ReadonlyArray<SerializedColumnsSource>): CollectionHandle;

  /** Whether the collection currently exposes zero columns. */
  isEmpty(handle: CollectionHandle): boolean;

  /** Whether enumeration is finalised across every contributing source. */
  isFinal(handle: CollectionHandle): boolean;

  /** Canonical id list for the columns visible through this collection. */
  getColumns(handle: CollectionHandle): ColumnUniversalId[];

  /** Append one or more sources and return a fresh collection handle. */
  addSource(
    handle: CollectionHandle,
    sources: ReadonlyArray<SerializedColumnsSource>,
  ): CollectionHandle;

  /** Anchored/selector-driven discovery. Returns a fresh handle. */
  discover(handle: CollectionHandle, options: ColumnsDiscoverOptions): CollectionHandle;

  /** Selector-only filter (no anchor traversal). Returns a fresh handle. */
  filter(handle: CollectionHandle, options: ColumnsFilterOptions): CollectionHandle;
}

/**
 * Synchronous host-side driver for `ColumnsCollection` operations. All
 * collection state lives on the host side, addressable through opaque
 * {@link CollectionHandle}s. Every handle-minting method returns a
 * {@link PoolEntry} so callers can wire the refcount into their own
 * lifecycle; the VM bridge pins each entry to the active render ctx and
 * forwards only the handle string to sandbox.
 *
 * Sandbox / UI callers consume {@link ColumnsCollectionDriverModel}
 * instead; the bridge maps that surface onto this one by injecting
 * {@link ColumnsCollectionDriverHost} bindings.
 */
export interface ColumnsCollectionDriver {
  create(
    sources: ReadonlyArray<SerializedColumnsSource>,
    host: ColumnsCollectionDriverHost,
  ): PoolEntry<CollectionHandle>;

  isEmpty(handle: CollectionHandle): boolean;
  isFinal(handle: CollectionHandle): boolean;
  getColumns(handle: CollectionHandle, host: ColumnsCollectionDriverHost): ColumnUniversalId[];

  addSource(
    handle: CollectionHandle,
    sources: ReadonlyArray<SerializedColumnsSource>,
    host: ColumnsCollectionDriverHost,
  ): PoolEntry<CollectionHandle>;

  discover(
    handle: CollectionHandle,
    options: ColumnsDiscoverOptions,
    host: ColumnsCollectionDriverHost,
  ): PoolEntry<CollectionHandle>;

  filter(
    handle: CollectionHandle,
    options: ColumnsFilterOptions,
    host: ColumnsCollectionDriverHost,
  ): PoolEntry<CollectionHandle>;
}
