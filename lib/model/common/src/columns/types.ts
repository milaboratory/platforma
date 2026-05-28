import type { Branded } from "../branding";
import type { PObjectId } from "../pool";

/**
 * Opaque sandbox/host accessor handle.
 *
 * Both the sandbox `TreeNodeAccessor.handle` and the host-issued accessor
 * keys alias this brand — `sdk/model` re-exports the same type so the two
 * sides stay structurally identical.
 */
export type AccessorHandle = Branded<string, "AccessorHandle">;

/**
 * Structural subset of {@link FieldTraversalStep} (from `@platforma-sdk/model`)
 * needed by the host/sandbox column-providers traversal.
 *
 * Defined locally so this module does not depend on the sandbox `render`
 * subtree. Both `TreeNodeAccessor.traverse` (sandbox) and
 * `PlTreeNodeAccessor.traverse` (host) accept a superset of these fields, so
 * structural compatibility is preserved.
 */
export interface FieldTraversalStepLike {
  /** Field name */
  readonly field: string;
  /** Asserted field type — used by `accessor.traverse` to validate. */
  readonly assertFieldType?: "Input" | "Output" | "Service" | "OTW" | "Dynamic" | "MTW";
  /** Don't terminate chain if current resource or field has an error associated. */
  readonly ignoreError?: true;
}

/**
 * Raw entry returned by {@link GlobalCfgRenderCtxMethods.getUpstreamBlockCtx}
 * on the sandbox side, or by `collectUpstreamBlockCtx` on the host side.
 * Carries handle ids only — providers wrap them into accessor instances as
 * needed.
 *
 * Generic over the handle type so the same shape backs both:
 * - sandbox (`AHandle = AccessorHandle`, a `Branded<string, "AccessorHandle">`)
 * - host (`AHandle = PlTreeNodeAccessor`, the resolved accessor instance)
 *
 * Default `AHandle = string` since `AccessorHandle` is a brand on `string` —
 * the default is safe for the sandbox case.
 */
export interface UpstreamBlockCtx<AHandle = string> {
  blockId: string;
  prodCtx?: AHandle;
  stagingCtx?: AHandle;
  /** True when the `prodCtx` ctx-holder exists but `prodUiCtx` is still rendering. */
  prodIncomplete?: boolean;
  /** True when the `stagingCtx` ctx-holder exists but `stagingUiCtx` is still rendering. */
  stagingIncomplete?: boolean;
}

/**
 * Minimal accessor surface used by column-providers / column-registry
 * traversal.
 *
 * Both sandbox `TreeNodeAccessor` and host `PlTreeNodeAccessor` satisfy this
 * contract directly — `traverse(step)` is defined on both, and the other
 * members already match by shape. No `resolvePath` member: when canonical
 * `PObjectId`s are required (local-id construction inside the
 * outputs/prerun branch), the traversal helpers thread the path explicitly.
 */
export interface AccessorLike<Self extends AccessorLike<Self>> {
  /** Resource type carried by the underlying node (only `.name` is used). */
  readonly resourceType: { readonly name: string };

  /**
   * Single-step field traversal. Returns `undefined` when the field is
   * absent / unresolved (with `ignoreError`). Same shape on sandbox and host —
   * sandbox `TreeNodeAccessor.traverse` is an alias for `resolveAny` and host
   * `PlTreeNodeAccessor.traverse` is the canonical method.
   */
  traverse(step: FieldTraversalStepLike): Self | undefined;

  /** List input-field names on this node. */
  listInputFields(): string[];

  /** Whether the input-field collection on this node is finalized. */
  getInputsLocked(): boolean;

  /** Whether this node has a data payload attached. */
  hasData(): boolean;

  /** Decode the data payload as JSON. Returns `undefined` if no data. */
  getDataAsJson<T = unknown>(): T | undefined;
}

/**
 * One indexed column — the canonical record produced by every traversal.
 * Carries everything needed to read spec/data/status under a stable id.
 *
 * Generic over the accessor flavour so the same record shape works for both
 * the sandbox `TreeNodeAccessor` and the host `PlTreeNodeAccessor`.
 */
export type LeafEntry<A extends AccessorLike<A>> = {
  /** PFrame accessor that owns `<name>.spec` / `<name>.data` fields. */
  accessor: A;
  /** Field-name prefix inside the PFrame. */
  name: string;
  /** Canonical id under which this column is reachable. */
  id: PObjectId;
};

/**
 * Base interface for id-indexed column providers — the surface
 * {@link ColumnRegistry} consumes. Generic over the concrete accessor flavour
 * so it can back both sandbox (`TreeNodeAccessor`) and host
 * (`PlTreeNodeAccessor` adapter) registries.
 */
export interface ColumnEntriesProvider<A extends AccessorLike<A>> {
  /** Map of canonical {@link PObjectId} → {@link LeafEntry} for every column reachable from this source. */
  getPObjectEntries(): ReadonlyMap<PObjectId, LeafEntry<A>>;
  /** Whether enumeration of columns from this source has finalised. */
  isFinal(): boolean;
}
