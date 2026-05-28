import {
  applyAxisFilters,
  stringifyColumnFilteredId,
  type AxisFilterByIdx,
  type AxisSpec,
  type ColumnFilteredId,
  type ColumnFilteredKey,
  type PColumnSpec,
  type PObjectId,
  type SingleAxisSelector,
  type SpecOverrides,
  type SpecQuery,
} from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx } from "../../render/internal";
import type { ColumnFieldStatus, ColumnResolutionStatus } from "./types";
import { ColumnRecipe } from "./index";
import { ColumnOverridedRecipe } from "./column_overrided_recipe";
import { rebrandLeafId } from "./leaf_rebrand";

/**
 * Recipe wrapper that fixes the values of selected axes of an inner recipe
 * (axis slicing). The id is `FilteredPColumnId { source: inner.id,
 * axisFilters }`.
 *
 * Flat-merge invariant: `inner` is never another {@link ColumnFilteredRecipe}.
 * Repeated {@link wrap} concatenates `axisFilters` at the current level.
 *
 * Layering: `withSpecs` on a Filtered recipe yields
 * `Overrided<Filtered<inner>>` — Overrided is always the outermost layer.
 * The reverse layering (`Filtered<Overrided<...>>`) is not reachable via
 * the public interface.
 */
export class ColumnFilteredRecipe implements ColumnRecipe<ColumnFilteredId> {
  /**
   * Wrap any recipe with axis filters. If `inner` is already a
   * {@link ColumnFilteredRecipe}, concatenates `axisFilters` and returns a
   * new Filtered sharing the original `inner`.
   *
   * Validates every axis index against `inner.getSpec().axesSpec` at
   * construction — throws on an out-of-range index. After {@link wrap}, the
   * recipe is guaranteed to be spec-complete.
   *
   * Order semantics: new filters are appended after existing ones, preserving
   * their relative order. AND composition is otherwise commutative; order
   * only affects canonicalize/equality.
   */
  static wrap(col: ColumnRecipe, axisFilters: AxisFilterByIdx[]): ColumnFilteredRecipe {
    const combined =
      col instanceof ColumnFilteredRecipe ? [...col.axisFilters, ...axisFilters] : axisFilters;
    const base = col instanceof ColumnFilteredRecipe ? col.inner : col;

    if (combined.length === 0) {
      throw new Error("ColumnFilteredRecipe.wrap: at least one axis filter must be provided");
    }

    const innerSpec = base.getSpec();
    const fixed = new Set<number>();
    for (const [idx] of combined) {
      if (innerSpec.axesSpec[idx] === undefined) {
        throw new Error(
          `ColumnFilteredRecipe.wrap: axis index ${idx} out of range (inner has ${innerSpec.axesSpec.length} axes)`,
        );
      }
      fixed.add(idx);
    }
    if (fixed.size >= innerSpec.axesSpec.length) {
      throw new Error(
        `ColumnFilteredRecipe.wrap: filters fix all ${innerSpec.axesSpec.length} axes — at least one axis must remain`,
      );
    }

    return new ColumnFilteredRecipe(base, combined);
  }

  /**
   * Static counterpart to {@link wrap}: returns the resolution status of a
   * {@link ColumnFilteredKey} without constructing the recipe. Axis filters
   * do not add references — status collapses to the source's status.
   */
  static getStatusByKey(
    key: ColumnFilteredKey,
    opts: { ctx?: GlobalCfgRenderCtx } = {},
  ): ColumnResolutionStatus {
    if (typeof key.source !== "string") {
      throw new Error(
        "ColumnFilteredRecipe.getStatusByKey: filtered column with non-string source",
      );
    }
    return ColumnRecipe.getStatus(key.source, opts);
  }

  readonly id: ColumnFilteredId;
  private specCache?: { readonly value: PColumnSpec };
  private queryCache?: { readonly value: SpecQuery };
  private dataStatusCache?: { readonly value: ColumnFieldStatus };

  private constructor(
    private readonly inner: ColumnRecipe,
    private readonly axisFilters: AxisFilterByIdx[],
  ) {
    this.id = stringifyColumnFilteredId({
      source: inner.id,
      axisFilters,
    });
  }

  /** Wrapped recipe — exposed so external walkers can descend. */
  getInner(): ColumnRecipe {
    return this.inner;
  }

  /** Axis filters do not introduce references to other columns. */
  getReferencedIds(): PObjectId[] {
    return this.inner.getReferencedIds();
  }

  getDataStatus(): ColumnFieldStatus {
    if (this.dataStatusCache === undefined) {
      this.dataStatusCache = { value: this.inner.getDataStatus() };
    }
    return this.dataStatusCache.value;
  }

  /**
   * Final spec — the inner spec with fixed axes removed. Indices in
   * `axisFilters` are positional against `inner.getSpec().axesSpec` and were
   * validated at {@link wrap} time.
   */
  getSpec(): PColumnSpec {
    if (this.specCache === undefined) {
      this.specCache = { value: applyAxisFilters(this.inner.getSpec(), this.axisFilters) };
    }
    return this.specCache.value;
  }

  /**
   * Wraps the inner query in `SpecQuerySliceAxes`. Index→selector resolution
   * goes through the inner spec — guaranteed available since {@link wrap}
   * validated all indices at construction.
   */
  getQuery(): SpecQuery {
    if (this.queryCache === undefined) {
      const innerQuery = this.inner.getQuery();
      if (this.axisFilters.length === 0) {
        // Pass-through (no filters): rebrand the inner leaf to this.id so
        // wrappers in the chain don't reintroduce the inner's id at the
        // leaf — keeps the resolver/leaf-id contract uniform.
        this.queryCache = { value: rebrandLeafId(innerQuery, this.inner.id, this.id) };
      } else {
        const innerSpec = this.inner.getSpec();
        this.queryCache = {
          value: {
            type: "sliceAxes",
            input: rebrandLeafId(innerQuery, this.inner.id, this.id),
            axisFilters: this.axisFilters.map(([idx, value]) => ({
              axisSelector: toAxisSelector(innerSpec.axesSpec[idx]),
              constant: value,
            })),
          },
        };
      }
    }
    return this.queryCache.value;
  }

  /**
   * Filtered + overrides → Overrided<Filtered>. Overrided is always the
   * outermost layer.
   */
  withSpecs(overrides: SpecOverrides): ColumnRecipe {
    return ColumnOverridedRecipe.wrap(this, overrides);
  }
}

function toAxisSelector(axis: AxisSpec): SingleAxisSelector {
  const selector: SingleAxisSelector = { name: axis.name, type: axis.type };
  if (axis.domain !== undefined && Object.keys(axis.domain).length > 0) {
    selector.domain = axis.domain;
  }
  return selector;
}
