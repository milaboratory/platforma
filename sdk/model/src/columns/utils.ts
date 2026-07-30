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
import { DataColumnRecipe, DataColumnImpl, type ColumnData } from "./data_column";
import { ColumnDiscoveredRecipe } from "./column_recipes/column_discovered_recipe";
import { ColumnFilteredRecipe } from "./column_recipes/column_filtered_recipe";
import {
  ColumnOverriddenRecipe,
  DataColumnOverriddenRecipe,
} from "./column_recipes/column_overrided_recipe";
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
 * the resolved {@link DataColumnRecipe} variant.
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
 * {@link DataColumnRecipe} leaves. Throws if any id fails to resolve —
 * matches the contract of the legacy `resolveLinkers` it replaces.
 */
export function collectLinkerColumns(
  recipe: ColumnRecipe,
  opts: { ctx?: GlobalCfgRenderCtx } = {},
): DataColumnRecipe<PObjectId>[] {
  return collectLinkerIds(recipe).map(
    (id) =>
      DataColumnImpl.fromId(id, opts) ??
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
 * {@link DataColumnRecipe} through the ambient ctx) and ANDs `hasData()` across
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
    const leaf = DataColumnImpl.fromId(id, opts);
    if (leaf === undefined) return false;
    if (leaf.getDataStatus() !== "present") return false;
    if (!isLeafDataPresent(leaf.getData())) return false;
  }
  return true;
}

function isLeafDataPresent(data: ColumnData): boolean {
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
 * Whether the recipe reads exactly one data column — its own — rather than
 * reaching through others.
 *
 * True for a bare leaf and for projections over one (spec overrides, axis
 * slicing): those add layers but no new columns. False when the recipe gets at
 * its data through further columns, which happens when discovery reached it via
 * a linker chain.
 *
 * **Why callers care.** A recipe over a single data column is co-indexed by its
 * own axes, so its spec is the whole truth about them. One that needs other
 * columns only lines up after they are joined in, and therefore drags axes into
 * the join that its own spec never mentions — which is why it cannot serve as a
 * primary column, and why `createPlDataTableV3` splits on this.
 *
 * The count comes from {@link ColumnRecipe.getReferencedIds}, which resolves
 * through the whole wrapper chain, so no class walk is involved and foreign
 * `ColumnRecipe` implementations are handled too.
 */
export function hasSingleDataColumn(recipe: ColumnRecipe): boolean {
  return recipe.getReferencedIds().length === 1;
}

/**
 * @deprecated Renamed to {@link hasSingleDataColumn} — "leaf" read as "you can
 * get data out of it", which is a different question (see
 * {@link hasReachableData}). Same semantics.
 */
export const isLeafColumn = hasSingleDataColumn;

/**
 * Whether the column's data can be read here and now, consistent with its
 * spec — narrows to {@link DataColumnRecipe}, which exposes `getData()`.
 *
 * True for a bare leaf and for a spec-override over a bare leaf. False for an
 * axis-filtered recipe (its spec has dropped axes the underlying data still
 * carries, so the two no longer line up) and for anything reached through
 * other columns (nothing to read until the engine joins them). In both of
 * those cases the data exists only engine-side: pass `recipe.id` to
 * `createPFrame` / `createPTable` instead of trying to read it.
 *
 * The distinction is settled when the recipe is built, not here — recipes that
 * carry data are instances of a class that declares `getData`. So a `true`
 * result narrows to a value that really has the method, and there is no
 * throwing path behind the guard.
 */
export function hasReachableData(recipe: ColumnRecipe): recipe is DataColumnRecipe {
  return recipe instanceof DataColumnImpl || recipe instanceof DataColumnOverriddenRecipe;
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
