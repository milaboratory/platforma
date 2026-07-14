import type {
  ColumnUniversalId,
  PColumnSpec,
  PObjectId,
  SpecOverrides,
  SpecQuery,
} from "@milaboratories/pl-model-common";

export type { SpecQuery };

/**
 * Stable identifier of a recipe: either the canonical {@link PObjectId} of a
 * leaf or a {@link ColumnUniversalId} encoding `Overridden / Discovered /
 * Filtered` layers on top of it.
 *
 * Recipes are equivalent as value-objects iff their `id`s match (structurally,
 * after canonicalization).
 */
export type ColumnRecipeId = ColumnUniversalId;

/**
 * Aggregate data status of a recipe: the "worst" status across every
 * PObjectId the recipe references (the leaf itself plus any refs inside
 * overrides/discovery).
 *
 * "All or nothing" semantics: spec/query built from a recipe are meaningful
 * only when every referenced column is `present`.
 */
export type ColumnFieldStatus = "resolving" | "absent" | "present";

/**
 * Resolution status of a recipe — whether the recipe is meaningful in the
 * active render ctx. Aggregates spec readiness (the recipe can be
 * constructed/used) and data readiness (the underlying leaves can be read).
 *
 *  - `present`:  spec + data readable end-to-end.
 *  - `resolving`: more accessor inputs may still arrive — recheck later.
 *  - `absent`:   every relevant accessor is `inputsLocked`; nothing more will
 *                appear. Used at boundaries to throw early instead of silently
 *                producing an empty/broken recipe.
 *
 * Distinct from {@link ColumnFieldStatus}: that one is the leaf's data field
 * status only. {@link ColumnResolutionStatus} also folds in spec/registry
 * readiness, so the recipe interface exposes both.
 */
export type ColumnResolutionStatus = "present" | "resolving" | "absent";

/**
 * Base contract of a column recipe — an immutable description of HOW to
 * obtain a column, not the column itself.
 *
 * A recipe is a value-object. The only transformation exposed via the
 * interface is {@link withSpecs}: it overlays overrides on the spec.
 * `withDiscovery` / `withAxisFilters` are intentionally absent — discovered
 * and filtered recipes are built only via their own factory constructors
 * from a leaf recipe; nothing further can be stacked on top of Discovered
 * or Filtered.
 *
 * Invariant: `withSpecs` never nests. A recipe is either bare or wrapped
 * in exactly one Overridden layer. Repeated `withSpecs` merges the new
 * overrides into the existing ones, keeping the same depth.
 *
 * A recipe intentionally exposes no `getSpecOverrides / getDiscovery /
 * getAxisFilters` getters: those encoding pieces are details of the id.
 * Consumers that need to decompose call utilities from `pl-model-common`
 * over `recipe.id`.
 */
export interface ColumnRecipe<ID extends ColumnRecipeId = ColumnRecipeId> {
  /** Canonical recipe identifier. */
  readonly id: ID;

  /** PObjectIds referenced by this recipe (leaf + any nested refs). */
  getReferencedIds(): PObjectId[];

  /**
   * Final spec — built via `pframespec` from id + base spec of the source.
   * No partial JS logic: the result matches what the engine returns when
   * executing {@link getQuery}.
   *
   * Always returns a value: the recipe factories validate all referenced
   * specs at construction time and return `undefined` from the factory if
   * anything is missing. A constructed recipe is by contract spec-complete.
   */
  getSpec(): PColumnSpec;

  /**
   * IR describing how to obtain the column — a {@link SpecQuery} from
   * `pl-model-common`. The recipe builds the description; execution belongs
   * to the layer above (pframespec/engine).
   *
   * The return is parameterized with default `C = PObjectId`. Concrete
   * recipes may narrow the parameter (e.g. `SpecQuery<ColumnRecipeId>`) if
   * they need to thread nested id variants.
   */
  getQuery(): SpecQuery;

  /**
   * Aggregate status across ALL PObjectIds this recipe reaches: own leaf +
   * refs from overrides + the parent chain of discovery.
   *
   * Rule: `absent ▸ resolving ▸ present` ("worst wins").
   */
  getDataStatus(): ColumnFieldStatus;

  /**
   * Apply overrides on the spec. Always returns a new recipe.
   *
   * Flat-merge invariant: if `self` is already Overridden, the implementation
   * merges `overrides` with the existing ones and returns the same depth
   * (one Overridden wrapper). No `Overridden<Overridden<...>>`.
   */
  withSpecs(overrides: SpecOverrides): ColumnRecipe;
}
