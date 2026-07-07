import {
  distillColumnDiscoveredKey,
  extractPObjectId,
  stringifyColumnDiscoveredId,
  type AxisQualification,
  type ColumnDiscoveredId,
  type ColumnDiscoveredKey,
  type ColumnUniversalId,
  type PColumnSpec,
  type PObjectId,
  type SpecOverrides,
  type SpecQuery,
} from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx } from "../../render/internal";
import type { ColumnFieldStatus, ColumnResolutionStatus } from "./types";
import { ColumnRecipe } from "./index";
import { ColumnOverriddenRecipe } from "./column_overrided_recipe";
import { Column } from "../column";
import { rebrandLeafId } from "./leaf_rebrand";
import { throwError } from "@milaboratories/helpers";

/**
 * Recipe for columns identified by a {@link ColumnDiscoveredKey}: a base
 * column + a `path` of linkers + qualifications.
 *
 * Specifics:
 *  - References more than one column (`column` + each `path[i].column`);
 *    {@link getDataStatus} aggregates across the whole set.
 *  - {@link getQuery} assembles the {@link SpecQuery} locally
 *    ({@link buildSpecQuery}) — the hit is inlined as its own recipe's query
 *    tree, linkers fold inside-out into nested `linkerJoin` nodes.
 *  - {@link getSpec} runs `createSpecFrame` + `evaluateQuery` over that query
 *    to project the final {@link PColumnSpec} after the linker chain.
 */
export class ColumnDiscoveredRecipe implements ColumnRecipe<ColumnDiscoveredId> {
  /**
   * Validate the key + resolve every referenced column via
   * {@link ColumnLazy.fromId} (which itself checks the leaf accessor reports
   * `hasData()`). Returns `undefined` if the key is malformed or any
   * referenced column is not yet spec-resolvable.
   *
   * Spec JSON is deserialized lazily on first {@link getSpec}/{@link getQuery}.
   */
  static fromKey(
    key: ColumnDiscoveredKey,
    opts: { ctx?: GlobalCfgRenderCtx } = {},
  ): undefined | ColumnDiscoveredRecipe {
    const distilled = distillColumnDiscoveredKey(key);
    const columns: Record<ColumnUniversalId, Column> = {};
    for (const uniId of referencedUniIdsOf(distilled)) {
      const recipe = Column(uniId, opts);
      if (recipe === undefined) return undefined;
      columns[uniId] = recipe;
    }
    return new ColumnDiscoveredRecipe(distilled, columns);
  }

  /**
   * Static counterpart to {@link fromKey}: returns the resolution status of
   * a {@link ColumnDiscoveredKey} without constructing the recipe. Worst-wins
   * across every referenced {@link ColumnUniversalId} (hit + path linkers),
   * each resolved via the top-level {@link ColumnRecipe.getStatus} dispatcher.
   */
  static getStatusByKey(
    key: ColumnDiscoveredKey,
    opts: { ctx?: GlobalCfgRenderCtx } = {},
  ): ColumnResolutionStatus {
    const distilled = distillColumnDiscoveredKey(key);
    let worst: ColumnResolutionStatus = "present";
    for (const uniId of referencedUniIdsOf(distilled)) {
      const s = ColumnRecipe.getStatus(uniId, opts);
      if (s === "absent") return "absent";
      if (s === "resolving") worst = "resolving";
    }
    return worst;
  }

  readonly id: ColumnDiscoveredId;
  private specCache?: { readonly value: PColumnSpec };
  private queryCache?: { readonly value: SpecQuery };
  private dataStatusCache?: { readonly value: ColumnFieldStatus };

  private constructor(
    private readonly key: ColumnDiscoveredKey,
    private readonly columns: Record<ColumnUniversalId, ColumnRecipe>,
  ) {
    this.id = stringifyColumnDiscoveredId(this.key);
  }

  /**
   * Universal id of the hit column (excluding path/qualifications on top).
   * May itself be a wrapped id (Overridden / Filtered / nested Discovered) —
   * preserves projections applied to the underlying column.
   */
  getHitId(): ColumnUniversalId {
    return this.key.column;
  }

  /**
   * Axis qualifications attached to the hit column itself — applied to the
   * outer-join entry that wraps this column at the consumer boundary.
   */
  getColumnQualifications(): readonly AxisQualification[] {
    return this.key.columnQualifications ?? [];
  }

  /**
   * Per-primary-column qualifications applied to the primary anchors on
   * this group's side. Keyed by the external primary column id.
   */
  getQueriesQualifications(): Readonly<Record<PObjectId, AxisQualification[]>> {
    return this.key.queriesQualifications ?? {};
  }

  /**
   * Leaf {@link PObjectId}s the recipe physically depends on: hit column +
   * each linker in `path`, with any projection wrappers unwrapped down to
   * their underlying storage column. Used to track real-data dependencies
   * (e.g. {@link getDataStatus}), not projected identities.
   */
  getReferencedIds(): PObjectId[] {
    return [...new Set([...referencedUniIdsOf(this.key)].map((uniId) => extractPObjectId(uniId)))];
  }

  /**
   * Final spec of a discovered hit is just the hit column's own spec: the
   * linker chain only enables co-indexing, it does not remap the hit's
   * `axesSpec`, and axis qualifications live on the outer join entry (see
   * {@link buildSpecQuery}), not in the spec. So pass through to the hit
   * recipe's `getSpec()` — no engine round-trip needed. This mirrors the
   * Discovered branch of `reconstructSpecFromId` on the host side.
   */
  getSpec(): PColumnSpec {
    if (this.specCache === undefined) {
      const hit =
        this.columns[this.key.column] ??
        throwError(`ColumnDiscoveredRecipe.getSpec: missing column ${this.key.column}`);
      this.specCache = { value: hit.getSpec() };
    }
    return this.specCache.value;
  }

  /** IR for building the final spec — see {@link buildSpecQuery}. */
  getQuery(): SpecQuery {
    if (this.queryCache === undefined) {
      this.queryCache = { value: this.buildSpecQuery() };
    }
    return this.queryCache.value;
  }

  getDataStatus(): ColumnFieldStatus {
    if (this.dataStatusCache === undefined) {
      this.dataStatusCache = {
        value: Object.values(this.columns).reduce<ColumnFieldStatus>((worst, lazy) => {
          const s = lazy.getDataStatus();
          if (s === "absent" || worst === "absent") return "absent";
          if (s === "resolving") return "resolving";
          return worst;
        }, "present"),
      };
    }
    return this.dataStatusCache.value;
  }

  /**
   * Discovered + overrides → Overridden<Discovered>. Delegates to the
   * flat-merge factory of ColumnOverriddenRecipe; subsequent `withSpecs`
   * calls merge at the Overridden level (one wrapper, no nesting).
   */
  withSpecs(overrides: SpecOverrides): ColumnRecipe {
    return ColumnOverriddenRecipe.wrap(this, overrides);
  }

  /**
   * Assembles the SpecQuery for this discovered hit by folding `key.path`
   * around the hit column.
   *
   * The hit (innermost) is built by inlining `columns[key.column].getQuery()`
   * — recursing into the hit's own recipe — so wrapping layers on the hit
   * (Overridden / Filtered / nested Discovered) appear in the produced tree.
   * The previous `pframeSpec.buildQuery` path was a flat
   * {@link PObjectId}-only call and could not express that.
   *
   * Linkers stay as plain column references on the linker side of
   * `linkerJoin` (the spec node has no slot for a query-side linker); the
   * linker's recipe id is used directly. The frame registered in
   * {@link getSpec} carries each recipe's final spec under that same id, so
   * the engine resolves linker axes from the post-projection spec.
   *
   * Path ordering matches {@link ColumnDiscoveredKey.path}: `path[0]` is
   * outermost, `path[N-1]` is closest to the hit. We fold from the inside
   * out — innermost wrap first — so the result lines up with that convention.
   *
   * `columnQualifications` / `queriesQualifications` are not emitted here —
   * qualifications live on a {@link SpecQueryJoinEntry} wrapper (lost on
   * unwrapping to {@link SpecQuery}). External consumers apply them at the
   * outer join via {@link getColumnQualifications} / {@link getQueriesQualifications}.
   */
  private buildSpecQuery(): SpecQuery {
    // Preserve the inner hit recipe's full query tree — it may carry
    // wrappers (specOverride / sliceAxes / nested linkerJoin) that the
    // host needs to apply correctly. We only rebrand the terminal column
    // leaf to this.id so two variants of the same physical hit reached via
    // different linker chains stay distinct columns in the engine output.
    const hitRecipe =
      this.columns[this.key.column] ??
      throwError(`ColumnDiscoveredRecipe.buildSpecQuery: missing column ${this.key.column}`);
    let query: SpecQuery = rebrandLeafId(hitRecipe.getQuery(), hitRecipe.id, this.id);
    const path = this.key.path ?? [];

    for (let i = path.length - 1; i >= 0; i--) {
      const linker =
        this.columns[path[i].column] ??
        throwError(
          `ColumnDiscoveredRecipe.buildSpecQuery: missing linker column ${path[i].column}`,
        );
      query = {
        type: "linkerJoin",
        linker: linker.getQuery(),
        secondary: [{ entry: query }],
      };
    }
    return query;
  }
}

function referencedUniIdsOf(key: ColumnDiscoveredKey): Set<ColumnUniversalId> {
  return new Set<ColumnUniversalId>([key.column, ...(key.path ?? []).map((item) => item.column)]);
}
