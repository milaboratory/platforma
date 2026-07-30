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
  ColumnRecipeId,
  ColumnResolutionStatus,
} from "./column_recipes/types";
import { ColumnOverriddenRecipe } from "./column_recipes/column_overrided_recipe";

export type DataColumnId = PObjectId;
export type ColumnData = undefined | PColumnDataUniversal;
export type { ColumnFieldStatus, ColumnResolutionStatus } from "./column_recipes/types";

/**
 * A {@link ColumnRecipe} that can be read directly in the sandbox: its
 * {@link getData} is guaranteed to be consistent with {@link getSpec}.
 *
 * This is a *capability*, not a class. Only two recipe shapes carry it — a
 * bare leaf and a spec-override over a bare leaf — because those are the only
 * ones whose data still matches their spec. An axis-filtered recipe drops axes
 * from its spec while the underlying data keeps them, and a discovered recipe
 * only materialises after a join; neither can be read here, so neither
 * implements this interface.
 *
 * Narrow to it with `hasReachableData(recipe)` rather than testing for a concrete
 * class — which recipe classes exist is an implementation detail behind
 * `recipe.id`.
 */
export interface DataColumnRecipe<
  ID extends ColumnRecipeId = ColumnRecipeId,
> extends ColumnRecipe<ID> {
  /** Column data, consistent with {@link ColumnRecipe.getSpec}. */
  getData(): ColumnData;
}

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
 * The leaf-recipe building block: a {@link DataColumnRecipe} whose `id` is a bare
 * {@link PObjectId} and whose readers are bound to a single tree-accessor
 * leaf. Layered encodings (Overridden / Discovered / Filtered) are reified
 * through their dedicated recipe classes and reference leaf columns by id.
 *
 * Internal — consumers hold the {@link DataColumnRecipe} interface and construct
 * through the {@link DataColumnRecipe} dispatcher.
 */
export class DataColumnImpl implements DataColumnRecipe<PObjectId> {
  private specCache?: { readonly value: PColumnSpec };
  private dataCache?: { readonly value: ColumnData };
  private dataStatusCache?: { readonly value: ColumnFieldStatus };

  private constructor(
    public readonly id: PObjectId,
    private readonly options: {
      getSpec: () => PColumnSpec;
      getData: () => ColumnData;
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

  getData(): ColumnData {
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
   * this leaf. The leaf itself stays bare (id remains a plain PObjectId);
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
  static fromId(
    id: PObjectId,
    { ctx }: { ctx?: GlobalCfgRenderCtx } = {},
  ): undefined | DataColumnRecipe<PObjectId> {
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
    return new DataColumnImpl(id, {
      getSpec: () => spec.getDataAsJson<PColumnSpec>(),
      getData: () => readDataAccessor(leaf),
      getDataStatus: () => readDataStatus(leaf),
    });
  }

  /** {@link PlRef} wrapper over {@link fromId}. */
  static fromPlRef(ref: PlRef): undefined | DataColumnRecipe<PObjectId> {
    return DataColumnImpl.fromId(createGlobalPObjectId(ref.blockId, ref.name));
  }

  /**
   * Bind directly to an accessor-backed {@link LeafEntry} — no registry.
   * Throws {@link ColumnAbsentError} if the leaf has no spec field and its
   * accessor is `inputsLocked`. Returns `undefined` while still resolving.
   */
  static fromAccessor(entry: LeafEntry<TreeNodeAccessor>): undefined | DataColumnRecipe<PObjectId> {
    const spec = readSpecAccessor(entry);
    if (isNil(spec)) {
      if (entry.accessor.getInputsLocked()) throw new ColumnAbsentError(entry.id);
      return undefined;
    }
    if (!spec.hasData()) return undefined;
    return new DataColumnImpl(entry.id, {
      getSpec: () => spec.getDataAsJson<PColumnSpec>(),
      getData: () => readDataAccessor(entry),
      getDataStatus: () => readDataStatus(entry),
    });
  }

  /**
   * Wrap a materialised {@link PColumn}. If the input is already a
   * {@link DataColumnRecipe} leaf it is returned as-is.
   */
  static fromColumn(
    column: PColumn<ColumnData> | DataColumnRecipe<PObjectId>,
  ): DataColumnRecipe<PObjectId> {
    if (column instanceof DataColumnImpl) return column;
    // `DataColumnRecipe` is an interface, so `instanceof` above does not remove it
    // from the union. The only implementation carrying a bare `PObjectId` is
    // `DataColumnImpl` (wrappers expose `ColumnUniversalId`), so anything
    // reaching here is a materialised `PColumn`.
    const pColumn = column as PColumn<ColumnData>;
    return new DataColumnImpl(pColumn.id, {
      getSpec: () => pColumn.spec,
      getData: () => pColumn.data,
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
    return DataColumnImpl.getStatusById(createGlobalPObjectId(ref.blockId, ref.name), opts);
  }

  /** No registry — reads straight off the entry's accessor. */
  static getStatusByAccessor(entry: LeafEntry<TreeNodeAccessor>): ColumnResolutionStatus {
    return getLeafEntryStatus(entry);
  }
}

/** Anything the {@link DataColumnRecipe} dispatcher can build a leaf from. */
export type DataColumnSource =
  | PObjectId
  | PlRef
  | LeafEntry<TreeNodeAccessor>
  | PColumn<ColumnData>
  | DataColumnRecipe<PObjectId>;

/**
 * Unified dispatcher — picks the right `DataColumnImpl.fromX` by source
 * shape. For ambiguous inputs callers can still use the explicit factories
 * (also attached as properties: `DataColumn.fromId`, `.fromPlRef`,
 * `.fromAccessor`, `.fromColumn`).
 */
function DataColumnDispatch(
  source: DataColumnSource,
  opts: { ctx?: GlobalCfgRenderCtx } = {},
): undefined | DataColumnRecipe<PObjectId> {
  if (typeof source === "string") return DataColumnImpl.fromId(source, opts);
  if (source instanceof DataColumnImpl) return source;
  // `DataColumnRecipe` is an interface — `instanceof` above cannot remove it from
  // the union, and only `DataColumnImpl` implements it with a bare id.
  const rest = source as LeafEntry<TreeNodeAccessor> | PlRef | PColumn<ColumnData>;
  if ("accessor" in rest) return DataColumnImpl.fromAccessor(rest);
  if (isPlRef(rest)) return DataColumnImpl.fromPlRef(rest);
  if (isPColumn(rest)) return DataColumnImpl.fromColumn(rest);
  throw new Error("DataColumn: unknown source shape");
}

/**
 * Polymorphic counterpart to {@link DataColumnDispatch}: returns the
 * {@link ColumnResolutionStatus} for any factory input without constructing
 * the recipe. For already-materialised sources ({@link PColumn} value,
 * existing {@link DataColumnRecipe}) status is `present` by construction.
 */
function DataColumnGetStatus(
  source: DataColumnSource,
  opts: { ctx?: GlobalCfgRenderCtx } = {},
): ColumnResolutionStatus {
  if (typeof source === "string") return DataColumnImpl.getStatusById(source, opts);
  if (source instanceof DataColumnImpl) return "present";
  const rest = source as LeafEntry<TreeNodeAccessor> | PlRef | PColumn<ColumnData>;
  if ("accessor" in rest) return DataColumnImpl.getStatusByAccessor(rest);
  if (isPlRef(rest)) return DataColumnImpl.getStatusByPlRef(rest, opts);
  if (isPColumn(rest)) return "present";
  throw new Error("DataColumn.getStatus: unknown source shape");
}

export const DataColumn = Object.assign(DataColumnDispatch, {
  fromId: DataColumnImpl.fromId,
  fromPlRef: DataColumnImpl.fromPlRef,
  fromAccessor: DataColumnImpl.fromAccessor,
  fromColumn: DataColumnImpl.fromColumn,
  getStatus: DataColumnGetStatus,
  getStatusById: DataColumnImpl.getStatusById,
  getStatusByPlRef: DataColumnImpl.getStatusByPlRef,
  getStatusByAccessor: DataColumnImpl.getStatusByAccessor,
});

/**
 * Type-guard narrowing to a bare leaf — a {@link DataColumnRecipe} whose `id` is a
 * plain {@link PObjectId}.
 */
export function isDataColumn(value: unknown): value is DataColumnRecipe<PObjectId> {
  return value instanceof DataColumnImpl;
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
