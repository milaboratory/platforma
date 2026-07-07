import {
  applySpecOverrides,
  createColumnOverriddenId,
  mergeSpecOverrides,
  type ColumnOverriddenId,
  type ColumnOverriddenKey,
  type ColumnUniversalId,
  type PColumnSpec,
  type PObjectId,
  type SpecOverrides,
  type SpecQuery,
} from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx } from "../../render/internal";
import type { ColumnFieldStatus, ColumnResolutionStatus } from "./types";
import { ColumnRecipe } from "./index";
import { Column } from "../column";
import { rebrandLeafId } from "./leaf_rebrand";

/**
 * A recipe whose id is not an Overridden wrap — valid `source` for Overridden.
 * Mirrors the spec-level invariant on {@link ColumnOverriddenKey.source}.
 */
type NonOverriddenColumn = Column<Exclude<ColumnUniversalId, ColumnOverriddenId>>;

/**
 * Recipe wrapper that overlays {@link SpecOverrides} on top of any other
 * recipe. The id is `ColumnOverriddenKey { source: inner.id, specOverrides }`.
 *
 * Flat-merge invariant: `inner` is never another {@link ColumnOverriddenRecipe}.
 * Repeated overrides go through {@link wrap} / {@link withSpecs}, which merge
 * `specOverrides` at the current level and keep wrapper depth constant.
 *
 * This invariant matches the one enforced inside `unwrapOverrides` from
 * pl-model-common: it explicitly throws on a nested override-wrap.
 */
export class ColumnOverriddenRecipe implements Column<ColumnOverriddenId> {
  /**
   * Wrap any recipe with overrides. If `inner` is already a
   * {@link ColumnOverriddenRecipe}, merges `overrides` into the existing ones
   * and returns a new Overridden sharing the original `inner`. No
   * `Overridden<Overridden<X>>` is produced.
   */
  static wrap(col: Column, overrides: SpecOverrides): ColumnOverriddenRecipe {
    if (col instanceof ColumnOverriddenRecipe) {
      return new ColumnOverriddenRecipe(col.inner, mergeSpecOverrides(col.overrides, overrides));
    }
    // `inner` is not an Overridden wrap (the `instanceof` branch above handles
    // that). Narrow the id union here so the constructor parameter stays
    // honest with `ColumnOverriddenKey.source`.
    return new ColumnOverriddenRecipe(col as NonOverriddenColumn, overrides);
  }

  /**
   * Static counterpart to {@link wrap}: returns the resolution status of a
   * {@link ColumnOverriddenKey} without constructing the recipe. Overrides
   * do not add references — status collapses to the source's status.
   */
  static getStatusByKey(
    key: ColumnOverriddenKey,
    opts: { ctx?: GlobalCfgRenderCtx } = {},
  ): ColumnResolutionStatus {
    return ColumnRecipe.getStatus(key.source, opts);
  }

  readonly id: ColumnOverriddenId;
  private specCache?: { readonly value: PColumnSpec };
  private queryCache?: { readonly value: SpecQuery };
  private dataStatusCache?: { readonly value: ColumnFieldStatus };

  private constructor(
    private readonly inner: NonOverriddenColumn,
    private readonly overrides: SpecOverrides,
  ) {
    this.id = createColumnOverriddenId({
      source: inner.id,
      specOverrides: overrides,
    });
  }

  /** Wrapped recipe — exposed so external walkers can descend. */
  getInner(): Column {
    return this.inner;
  }

  /**
   * `inner` owns all references; overrides are a pure spec patch and do not
   * introduce new column refs.
   */
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
   * Take the inner spec and overlay our overrides. `applySpecOverrides`
   * extracts the overrides from `this.id` itself.
   */
  getSpec(): PColumnSpec {
    if (this.specCache === undefined) {
      this.specCache = { value: applySpecOverrides(this.inner.getSpec(), this.id) };
    }
    return this.specCache.value;
  }

  /**
   * Emit a client-side `specOverride` node wrapping the inner query.
   *
   * This is a structural-but-collapsible node: it carries the override
   * patch through the query tree so consumers see the full recipe shape,
   * but it is collapsed at the host boundary (`resolvePColumn`) before
   * the query reaches pframe-engine. The engine never sees this node.
   *
   * Overrides do not change query topology — they are a pure spec patch.
   */
  getQuery(): SpecQuery {
    if (this.queryCache === undefined) {
      // Rebrand the inner column leaf to this.id (rich Overridden id) so
      // filter/sort references emitted with this recipe's id match the
      // leaf the engine sees. The specOverride node still wraps the leaf
      // and is collapsed at the host boundary into a spec patch on the
      // resolved PColumn.
      this.queryCache = {
        value: {
          type: "specOverride",
          input: rebrandLeafId(this.inner.getQuery(), this.inner.id, this.id),
          override: this.overrides,
        },
      };
    }
    return this.queryCache.value;
  }

  /**
   * Flat merge: new overrides merge with existing ones; `inner` is unchanged.
   * The result is an Overridden of the same depth.
   */
  withSpecs(overrides: SpecOverrides): Column {
    return ColumnOverriddenRecipe.wrap(this, overrides);
  }
}
