import {
  ColumnRegistry,
  createGlobalPObjectId,
  isPColumn,
  isPlRef,
  PlRef,
  PObjectId,
  type ColumnUniversalId,
  type LeafEntry,
  type PColumn,
  type PColumnSpec,
  type SpecOverrides,
  type SpecQuery,
} from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx, PColumnDataUniversal } from "../render/internal";
import { getCtxProviders } from "./column_providers";
import { isNil } from "es-toolkit";
import { LRUCache } from "lru-cache";
import { TreeNodeAccessor } from "../render";
import type {
  ColumnFieldStatus,
  ColumnRecipe,
  ColumnResolutionStatus,
} from "./column_recipes/types";
import { ColumnOverriddenRecipe } from "./column_recipes/column_overrided_recipe";

export type ColumnLazyId = PObjectId;
export type ColumnLazyData = undefined | PColumnDataUniversal;
export type { ColumnFieldStatus, ColumnResolutionStatus } from "./column_recipes/types";

/**
 * Thrown by leaf-recipe factories when the requested column is provably
 * absent in the active render ctx — i.e. every relevant accessor reports
 * `inputsLocked` and the column did not appear. Distinct from the
 * `undefined` return that the factories still use for the "resolving" case
 * (the column may still appear later).
 *
 * Catch at the boundary (resolver / filter+sort wiring / data-table assembly)
 * when partial absence should be surfaced to the user rather than silently
 * producing an empty result.
 */
export class ColumnAbsentError extends Error {
  constructor(public readonly id: ColumnUniversalId) {
    super(`Column is absent in the active render ctx and will not appear: ${id}`);
    this.name = "ColumnAbsentError";
  }
}

/**
 * ColumnLazy is the leaf-recipe building block: a {@link ColumnRecipe} whose
 * `id` is a bare {@link PObjectId} and whose readers are bound to a single
 * tree-accessor leaf. Layered encodings (Overridden / Discovered / Filtered)
 * are reified through their dedicated recipe classes and reference leaf
 * columns by id.
 */
export class ColumnLazyImpl implements ColumnRecipe<PObjectId> {
  private specCache?: { readonly value: PColumnSpec };
  private dataCache?: { readonly value: ColumnLazyData };
  private dataStatusCache?: { readonly value: ColumnFieldStatus };

  private constructor(
    public readonly id: PObjectId,
    private readonly options: {
      getSpec: () => PColumnSpec;
      getData: () => ColumnLazyData;
      getDataStatus: () => ColumnFieldStatus;
    },
  ) {}

  /** A leaf-recipe references exactly one column — its own id. */
  getReferencedIds(): PObjectId[] {
    return [this.id];
  }

  getSpec(): PColumnSpec {
    if (this.specCache === undefined) {
      this.specCache = { value: this.options.getSpec() };
    }
    return this.specCache.value;
  }

  /** Leaf-shaped — points straight at `this.id`. */
  getQuery(): SpecQuery {
    return { type: "column", column: this.id } as SpecQuery;
  }

  /** Leaf-only: not on the recipe interface — only the leaf can read data directly. */
  getData(): ColumnLazyData {
    if (this.dataCache === undefined) this.dataCache = { value: this.options.getData() };
    return this.dataCache.value;
  }

  getDataStatus(): ColumnFieldStatus {
    if (this.dataStatusCache === undefined) {
      this.dataStatusCache = { value: this.options.getDataStatus() };
    }
    return this.dataStatusCache.value;
  }

  /**
   * Overlay overrides → produces a {@link ColumnOverriddenRecipe} wrapping
   * this leaf. ColumnLazy itself stays bare (id remains a plain PObjectId);
   * layering lives entirely in the recipe wrappers.
   */
  withSpecs(overrides: SpecOverrides): ColumnRecipe {
    return ColumnOverriddenRecipe.wrap(this, overrides);
  }

  /**
   * Resolve via the ambient {@link ColumnRegistry}. Spec is resolved eagerly:
   * returns `undefined` if the leaf isn't reachable yet (resolving). Throws
   * {@link ColumnAbsentError} when every relevant accessor is `inputsLocked`
   * and the column did not appear — the column will not exist in this ctx.
   * Data and dataStatus stay lazy.
   */
  static fromId(id: PObjectId, { ctx }: { ctx?: GlobalCfgRenderCtx } = {}): undefined | ColumnLazy {
    const registry = new ColumnRegistry(getCtxProviders({ ctx }));
    const leaf = registry.resolve(id);
    if (isNil(leaf)) {
      if (registry.isFinal()) throw new ColumnAbsentError(id);
      return undefined;
    }
    const spec = readSpecAccessor(leaf);
    if (isNil(spec)) {
      if (leaf.accessor.getInputsLocked()) throw new ColumnAbsentError(id);
      return undefined;
    }
    if (!spec.hasData()) return undefined;
    return new ColumnLazyImpl(id, {
      getSpec: () => spec.getDataAsJson<PColumnSpec>(),
      getData: () => readDataAccessor(leaf),
      getDataStatus: () => readDataStatus(leaf),
    });
  }

  /** {@link PlRef} wrapper over {@link fromId}. */
  static fromPlRef(ref: PlRef): undefined | ColumnLazy {
    return ColumnLazyImpl.fromId(createGlobalPObjectId(ref.blockId, ref.name));
  }

  /**
   * Bind directly to an accessor-backed {@link LeafEntry} — no registry.
   * Throws {@link ColumnAbsentError} if the leaf has no spec field and its
   * accessor is `inputsLocked`. Returns `undefined` while still resolving.
   */
  static fromAccessor(entry: LeafEntry<TreeNodeAccessor>): undefined | ColumnLazy {
    const spec = readSpecAccessor(entry);
    if (isNil(spec)) {
      if (entry.accessor.getInputsLocked()) throw new ColumnAbsentError(entry.id);
      return undefined;
    }
    if (!spec.hasData()) return undefined;
    return new ColumnLazyImpl(entry.id, {
      getSpec: () => spec.getDataAsJson<PColumnSpec>(),
      getData: () => readDataAccessor(entry),
      getDataStatus: () => readDataStatus(entry),
    });
  }

  /**
   * Wrap a materialised {@link PColumn}. If the input is already a
   * {@link ColumnLazy} it is returned as-is.
   */
  static fromColumn(column: PColumn<ColumnLazyData> | ColumnLazy): ColumnLazy {
    if (column instanceof ColumnLazyImpl) return column;
    return new ColumnLazyImpl(column.id, {
      getSpec: () => column.spec,
      getData: () => column.data,
      getDataStatus: () => "present",
    });
  }

  /**
   * Distinguishes `present` / `resolving` / `absent` for a {@link PObjectId}
   * in the active render ctx. Falls back to the registry's `isFinal()`
   * when the id has no entry — only then we can say `absent` instead of
   * `resolving`.
   */
  static getStatusById(
    id: PObjectId,
    { ctx }: { ctx?: GlobalCfgRenderCtx } = {},
  ): ColumnResolutionStatus {
    const registry = new ColumnRegistry(getCtxProviders({ ctx }));
    const leaf = registry.resolve(id);
    if (isNil(leaf)) return registry.isFinal() ? "absent" : "resolving";
    return getLeafEntryStatus(leaf);
  }

  /** {@link PlRef} wrapper over {@link getStatusById}. */
  static getStatusByPlRef(
    ref: PlRef,
    opts: { ctx?: GlobalCfgRenderCtx } = {},
  ): ColumnResolutionStatus {
    return ColumnLazyImpl.getStatusById(createGlobalPObjectId(ref.blockId, ref.name), opts);
  }

  /** No registry — reads straight off the entry's accessor. */
  static getStatusByAccessor(entry: LeafEntry<TreeNodeAccessor>): ColumnResolutionStatus {
    return getLeafEntryStatus(entry);
  }
}

/**
 * Public type alias — `ColumnLazy` (the type) refers to the underlying
 * {@link ColumnLazyImpl} class instance. `ColumnLazy` (the value) is the
 * callable below with the static factories attached.
 */
export type ColumnLazy = ColumnLazyImpl;

/**
 * Unified dispatcher — picks the right `ColumnLazyImpl.fromX` by source
 * shape. For ambiguous inputs callers can still use the explicit factories
 * (also attached as properties: `ColumnLazy.fromId`, `.fromPlRef`,
 * `.fromAccessor`, `.fromColumn`).
 */
function ColumnLazyDispatch(
  source: PObjectId | PlRef | LeafEntry<TreeNodeAccessor> | PColumn<ColumnLazyData> | ColumnLazy,
  opts: { ctx?: GlobalCfgRenderCtx } = {},
): undefined | ColumnLazy {
  if (typeof source === "string") return ColumnLazyImpl.fromId(source, opts);
  if (source instanceof ColumnLazyImpl) return source;
  if ("accessor" in source) return ColumnLazyImpl.fromAccessor(source);
  if (isPlRef(source)) return ColumnLazyImpl.fromPlRef(source);
  if (isPColumn(source)) return ColumnLazyImpl.fromColumn(source);
  throw new Error("ColumnLazy: unknown source shape");
}

/**
 * Polymorphic counterpart to {@link ColumnLazyDispatch}: returns the
 * {@link ColumnResolutionStatus} for any factory input without constructing
 * the recipe. For already-materialised sources ({@link PColumn} value,
 * existing {@link ColumnLazy}) status is `present` by construction.
 */
function ColumnLazyGetStatus(
  source: PObjectId | PlRef | LeafEntry<TreeNodeAccessor> | PColumn<ColumnLazyData> | ColumnLazy,
  opts: { ctx?: GlobalCfgRenderCtx } = {},
): ColumnResolutionStatus {
  if (typeof source === "string") return ColumnLazyImpl.getStatusById(source, opts);
  if (source instanceof ColumnLazyImpl) return "present";
  if ("accessor" in source) return ColumnLazyImpl.getStatusByAccessor(source);
  if (isPlRef(source)) return ColumnLazyImpl.getStatusByPlRef(source, opts);
  if (isPColumn(source)) return "present";
  throw new Error("ColumnLazy.getStatus: unknown source shape");
}

export const ColumnLazy = Object.assign(ColumnLazyDispatch, {
  fromId: ColumnLazyImpl.fromId,
  fromPlRef: ColumnLazyImpl.fromPlRef,
  fromAccessor: ColumnLazyImpl.fromAccessor,
  fromColumn: ColumnLazyImpl.fromColumn,
  getStatus: ColumnLazyGetStatus,
  getStatusById: ColumnLazyImpl.getStatusById,
  getStatusByPlRef: ColumnLazyImpl.getStatusByPlRef,
  getStatusByAccessor: ColumnLazyImpl.getStatusByAccessor,
});

/**
 * Type-guard narrowing to the leaf recipe. Prefer this over
 * `instanceof ColumnLazyImpl` — `ColumnLazy` (the value) is the dispatcher
 * with statics, not the class, so `instanceof` requires the impl symbol.
 */
export function isColumnLazy(value: unknown): value is ColumnLazy {
  return value instanceof ColumnLazyImpl;
}

const readSpecAccessor = memoizeByEntry(
  ({ accessor, name }: LeafEntry<TreeNodeAccessor>): undefined | TreeNodeAccessor =>
    accessor.traverse({ field: `${name}.spec`, assertFieldType: "Input", ignoreError: true }),
);

/**
 * Per-entry counterpart to {@link readDataStatus}: tells whether the leaf's
 * **spec** can be read in this ctx, and — for the negative cases —
 * distinguishes `resolving` from `absent` via `getInputsLocked()`.
 *
 *  - spec field not yet on the entry's accessor + inputs locked → `absent`
 *  - spec field not yet on the entry's accessor + still resolving → `resolving`
 *  - spec resource present but bytes not yet written → `resolving`
 *    (transient — the spec resource is connected, just unfilled)
 *  - spec resource present and `hasData()` → `present`
 */
function getLeafEntryStatus(entry: LeafEntry<TreeNodeAccessor>): ColumnResolutionStatus {
  const spec = readSpecAccessor(entry);
  if (isNil(spec)) return entry.accessor.getInputsLocked() ? "absent" : "resolving";
  if (!spec.hasData()) return "resolving";
  return "present";
}

const readDataAccessor = memoizeByEntry(
  ({ accessor, name }: LeafEntry<TreeNodeAccessor>): undefined | TreeNodeAccessor =>
    accessor.traverse({ field: `${name}.data`, assertFieldType: "Input", ignoreError: true }),
);

const readDataStatus = memoizeByEntry(
  ({ accessor, name }: LeafEntry<TreeNodeAccessor>): ColumnFieldStatus => {
    if (accessor.listInputFields().includes(`${name}.data`)) return "present";
    return accessor.getInputsLocked() ? "absent" : "resolving";
  },
);

function memoizeByEntry<R>(
  fn: (entry: LeafEntry<TreeNodeAccessor>) => R,
): (entry: LeafEntry<TreeNodeAccessor>) => R {
  const cache = new LRUCache<string, { value: R }>({ max: 1000 });
  return (entry) => {
    const key = `${entry.accessor.handle}:${entry.name}`;
    let hit = cache.get(key);
    if (!hit) cache.set(key, (hit = { value: fn(entry) }));
    return hit.value;
  };
}
