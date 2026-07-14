import {
  collectSpecQueryColumns,
  extractPObjectId,
  isDataInfo,
  visitDataInfo,
  type AxisQualification,
  type ColumnUniversalId,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import { throwError } from "@milaboratories/helpers";
import type { GlobalCfgRenderCtx } from "../render/internal";
import { TreeNodeAccessor } from "../render";
import { deriveDistinctLabels, type DeriveLabelsOptions } from "../labels/derive_distinct_labels";
import { ColumnLazy, ColumnLazyImpl, type ColumnLazyData } from "./column_lazy";
import { ColumnDiscoveredRecipe } from "./column_recipes/column_discovered_recipe";
import { ColumnFilteredRecipe } from "./column_recipes/column_filtered_recipe";
import { ColumnOverriddenRecipe } from "./column_recipes/column_overrided_recipe";
import type { ColumnRecipe } from "./column_recipes/types";
import { ColumnsCollection, isColumnsCollection } from "./columns_collection";
import type { ColumnsSource } from "./column_providers/types";

/**
 * PObjectIds of every non-hit column referenced by `recipe.getQuery()`,
 * deduped in traversal order. The hit column is
 * `extractPObjectId(recipe.id)`; anything else in the query is a linker or
 * other engine-consumed column.
 *
 * Pure query walk — no registry access. Use {@link collectLinkerColumns} for
 * the resolved {@link ColumnLazy} variant.
 */
export function collectLinkerIds(recipe: ColumnRecipe): PObjectId[] {
  const hit = extractPObjectId(recipe.id);
  const seen = new Set<PObjectId>();
  const out: PObjectId[] = [];
  for (const id of collectSpecQueryColumns(recipe.getQuery())) {
    // Leaf ids in SpecQuery may be rich (e.g. ColumnDiscoveredId) — drop to
    // bare PObjectId before comparing/registering so we hand the ambient
    // ColumnRegistry physical ids it can resolve.
    const bare = extractPObjectId(id);
    if (bare === hit) continue;
    if (seen.has(bare)) continue;
    seen.add(bare);
    out.push(bare);
  }
  return out;
}

/**
 * {@link collectLinkerIds} resolved against the ambient context as
 * {@link ColumnLazy} instances. Throws if any id fails to resolve —
 * matches the contract of the legacy `resolveLinkers` it replaces.
 */
export function collectLinkerColumns(
  recipe: ColumnRecipe,
  opts: { ctx?: GlobalCfgRenderCtx } = {},
): ColumnLazy[] {
  return collectLinkerIds(recipe).map(
    (id) =>
      ColumnLazyImpl.fromId(id, opts) ??
      throwError(`materializeLinkers: linker ${id} not resolvable`),
  );
}

/**
 * Hit-side axis qualifications for the recipe — the ones that should land on
 * the outer-join entry wrapping this column at the consumer boundary.
 *
 * Descends {@link ColumnOverriddenRecipe} / {@link ColumnFilteredRecipe} via
 * `getInner()` until it finds a {@link ColumnDiscoveredRecipe}; otherwise
 * returns `[]`. Pure recipe walk — no query-tree introspection.
 */
export function hitQualifications(recipe: ColumnRecipe): readonly AxisQualification[] {
  const discovered = findDiscovered(recipe);
  return discovered?.getColumnQualifications() ?? [];
}

/**
 * Per-primary-column axis qualifications for the recipe — applied to the
 * outer primary anchors on this recipe's group side. Keyed by the external
 * primary column id (NOT by columns inside this recipe's own query).
 *
 * Same walk strategy as {@link hitQualifications}.
 */
export function queriesQualifications(
  recipe: ColumnRecipe,
): Readonly<Record<PObjectId, AxisQualification[]>> {
  const discovered = findDiscovered(recipe);
  return discovered?.getQueriesQualifications() ?? {};
}

/**
 * Whether the recipe's underlying data resources actually carry bytes —
 * strictly stronger than `getDataStatus() === "present"`, which only tells
 * that the `.data` field is wired onto the accessor.
 *
 * Walks every physical leaf the recipe depends on via
 * {@link ColumnRecipe.getReferencedIds} (resolves each id back to a
 * {@link ColumnLazy} through the ambient ctx) and ANDs `hasData()` across
 * all of them. Inline {@link PColumnValues} payloads count as present.
 *
 * Returns `false` if any leaf cannot be re-resolved in `opts.ctx` (treat as
 * "not yet ready") rather than throwing — this is a UI-facing predicate, not
 * a contract assertion.
 */
export function hasColumnData(
  recipe: ColumnRecipe,
  opts: { ctx?: GlobalCfgRenderCtx } = {},
): boolean {
  for (const id of recipe.getReferencedIds()) {
    const lazy = ColumnLazyImpl.fromId(id, opts);
    if (lazy === undefined) return false;
    if (lazy.getDataStatus() !== "present") return false;
    if (!isLazyDataPresent(lazy.getData())) return false;
  }
  return true;
}

function isLazyDataPresent(data: ColumnLazyData): boolean {
  if (data === undefined) return false;
  if (Array.isArray(data)) return true;
  if (data instanceof TreeNodeAccessor) return data.hasData();
  if (isDataInfo(data)) {
    let ok = true;
    visitDataInfo(data, (blob) => {
      ok &&= blob.hasData();
    });
    return ok;
  }
  return false;
}

/**
 * Walk wrapper layers (Overridden, Filtered) until a {@link
 * ColumnDiscoveredRecipe} is found. Returns `undefined` if the recipe chain
 * has no Discovered layer (bare leaves and Overridden-over-leaf cases).
 *
 * Invariant from the wrapper classes themselves: there is at most one
 * Discovered layer in any recipe chain — Discovered is constructed only via
 * its own factory and is never re-wrapped by Discovered.
 */
function findDiscovered(recipe: ColumnRecipe): undefined | ColumnDiscoveredRecipe {
  let current: ColumnRecipe = recipe;
  while (true) {
    if (current instanceof ColumnDiscoveredRecipe) return current;
    if (current instanceof ColumnOverriddenRecipe || current instanceof ColumnFilteredRecipe) {
      current = current.getInner();
      continue;
    }
    return undefined;
  }
}

/**
 * A recipe is a "leaf" (directly co-indexed on the anchor, reached without a
 * linker chain) iff its wrapper chain contains no {@link ColumnDiscoveredRecipe}.
 *
 * `Filtered` / `Overridden` over a bare leaf stay leaves; anything wrapping a
 * `Discovered` (e.g. `Overridden(Discovered(...))`) is linked. Use this — not an
 * `instanceof ColumnLazyImpl` check — to split direct vs. linker-joined columns,
 * since projections over a plain leaf are still direct.
 */
export function isLeafColumn(recipe: ColumnRecipe): boolean {
  return findDiscovered(recipe) === undefined;
}

/**
 * Data of the bare leaf a "leaf" recipe bottoms out at — reads the leaf-only
 * {@link ColumnLazy.getData} after walking the wrapper chain down via
 * {@link extractLeafColumn}. Returns `undefined` when the recipe is not a leaf (its
 * chain reaches a {@link ColumnDiscoveredRecipe}); the symmetric counterpart
 * of {@link isLeafColumn} returning `false`.
 */
export function getLeafColumnData(recipe: ColumnRecipe): ColumnLazyData {
  if (!isLeafColumn(recipe)) {
    throw new Error(`getLeafColumnData: recipe ${recipe.id} is not a leaf column`);
  }
  return extractLeafColumn(recipe)?.getData();
}

/**
 * Walk wrapper layers (Overridden, Filtered) down to the bare {@link ColumnLazy}
 * leaf the chain bottoms out at. Returns `undefined` if the chain reaches a
 * {@link ColumnDiscoveredRecipe} instead — i.e. the recipe is not a leaf
 * ({@link isLeafColumn} would return `false`). Mirror of {@link findDiscovered}.
 */
function extractLeafColumn(recipe: ColumnRecipe): undefined | ColumnLazy {
  let current: ColumnRecipe = recipe;
  while (true) {
    if (current instanceof ColumnLazyImpl) return current;
    if (current instanceof ColumnOverriddenRecipe || current instanceof ColumnFilteredRecipe) {
      current = current.getInner();
      continue;
    }
    if (current instanceof ColumnDiscoveredRecipe) {
      throw new Error(`extractLeafColumn: recipe ${recipe.id} is not a leaf column`);
    }
    throw new Error(`extractLeafColumn: unrecognized recipe layer for ${recipe.id}`);
  }
}

/** Drop-down option built over a {@link ColumnsCollection} — universal-id valued. */
export type ColumnOption = {
  readonly id: ColumnUniversalId;
  readonly label: string;
};

/**
 * Enumerates every column already in `source` and renders distinct labels
 * from each recipe's spec. Filtering is the caller's job — pass a
 * {@link ColumnsCollection} that was already narrowed via `.filter(...)` /
 * `.discover(...)`, or hand over a raw {@link ColumnsSource} (provider,
 * accessor, column array, or `"result_pool"` / `"current_block"` shorthand)
 * to be wrapped on the fly.
 */
export function deriveColumnOptions(
  source: ColumnsCollection | ColumnsSource[],
  labelOptions: DeriveLabelsOptions = {},
): ColumnOption[] {
  const collection = isColumnsCollection(source) ? source : ColumnsCollection(source);
  const recipes = collection.getColumns();
  const labels = deriveDistinctLabels(
    recipes.map((r) => r.getSpec()),
    labelOptions,
  );
  return recipes.map((r, i) => ({ id: r.id, label: labels[i] }));
}
