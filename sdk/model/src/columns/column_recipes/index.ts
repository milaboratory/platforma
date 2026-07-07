import {
  isColumnDiscoveredKey,
  isColumnOverriddenKey,
  parseColumnIdSafety,
  type ColumnUniversalId,
  type PObjectId,
  isPObjectKey,
  isColumnFilteredKey,
} from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx } from "../../render/internal";
import { ColumnLazyImpl } from "../column_lazy";
import { ColumnDiscoveredRecipe } from "./column_discovered_recipe";
import { ColumnFilteredRecipe } from "./column_filtered_recipe";
import { ColumnOverriddenRecipe } from "./column_overrided_recipe";
import type {
  ColumnRecipe as ColumnRecipeBase,
  ColumnRecipeId,
  ColumnResolutionStatus,
} from "./types";

export type { ColumnFieldStatus, ColumnRecipeId, ColumnResolutionStatus, SpecQuery } from "./types";
export { ColumnAbsentError } from "../column_lazy";
export { ColumnDiscoveredRecipe } from "./column_discovered_recipe";
export { ColumnFilteredRecipe } from "./column_filtered_recipe";
export { ColumnOverriddenRecipe } from "./column_overrided_recipe";

// Re-declare the interface locally so the name can merge with the dispatcher
// value declared below: a single name `ColumnRecipe` resolves to the
// interface in type position and to the factory function (`Object.assign`d
// with `.getStatus`) in value position.
// (Type-only re-exports do not participate in TS declaration merging.)
export interface ColumnRecipe<
  ID extends ColumnRecipeId = ColumnRecipeId,
> extends ColumnRecipeBase<ID> {}

/**
 * Build a `ColumnRecipe` from a stringified id. Dispatches to the matching
 * concrete recipe variant based on the id's encoding and recurses on
 * wrappers' inner `source`:
 *
 *   - bare {@link PObjectId} (non-JSON)               → `ColumnLazy.fromId`
 *   - `ColumnDiscoveredKey`                          → {@link ColumnDiscoveredRecipe}
 *   - `ColumnOverriddenKey { source, specOverrides }` → recurse on `source`,
 *                                                       then {@link ColumnOverriddenRecipe.wrap}
 *   - `ColumnFilteredKey { source, axisFilters }`     → recurse on `source`,
 *                                                       then {@link ColumnFilteredRecipe.wrap}
 *
 * Returns `undefined` for unsupported variants (e.g. AnchoredPColumnId,
 * which needs an anchor map to resolve) or when a nested source itself
 * cannot be built.
 */
function ColumnRecipeBuild(
  id: ColumnUniversalId,
  opts: { ctx?: GlobalCfgRenderCtx } = {},
): undefined | ColumnRecipe {
  const parsed = parseColumnIdSafety(id);

  if (isPObjectKey(parsed)) {
    return ColumnLazyImpl.fromId(id as PObjectId, opts);
  }

  if (isColumnDiscoveredKey(parsed)) {
    return ColumnDiscoveredRecipe.fromKey(parsed, opts);
  }

  if (isColumnOverriddenKey(parsed)) {
    const inner = ColumnRecipe(parsed.source, opts);
    if (inner === undefined) return undefined;
    return ColumnOverriddenRecipe.wrap(inner, parsed.specOverrides);
  }

  if (isColumnFilteredKey(parsed)) {
    // ColumnFilteredKey.source is a stringified ColumnUniversalId (leaf or
    // any nested wrapper). Legacy `FilteredPColumnId` with an AnchoredPColumnId
    // (object) source is not supported here — guard against it explicitly.
    if (typeof parsed.source !== "string") {
      throw new Error(
        `Unsupported ColumnRecipe id variant: filtered column with non-string source (${JSON.stringify(parsed.source)})`,
      );
    }
    const inner = ColumnRecipe(parsed.source, opts);
    if (inner === undefined) return undefined;
    return ColumnFilteredRecipe.wrap(inner, parsed.axisFilters);
  }

  throw new Error(`Unsupported ColumnRecipe id variant: ${id}`);
}

/**
 * Resolution status counterpart to {@link ColumnRecipeBuild}. Dispatches on
 * the parsed id shape to the matching `getStatusBy*` static — never
 * constructs the recipe. Use this at boundaries (resolver, filter/sort
 * targets) to throw early on `absent` instead of silently producing an empty
 * recipe via {@link ColumnRecipeBuild}.
 */
function ColumnRecipeGetStatus(
  id: ColumnUniversalId,
  opts: { ctx?: GlobalCfgRenderCtx } = {},
): ColumnResolutionStatus {
  const parsed = parseColumnIdSafety(id);
  if (isPObjectKey(parsed)) return ColumnLazyImpl.getStatusById(id as PObjectId, opts);
  if (isColumnDiscoveredKey(parsed)) return ColumnDiscoveredRecipe.getStatusByKey(parsed, opts);
  if (isColumnOverriddenKey(parsed)) return ColumnOverriddenRecipe.getStatusByKey(parsed, opts);
  if (isColumnFilteredKey(parsed)) return ColumnFilteredRecipe.getStatusByKey(parsed, opts);
  throw new Error(`Unsupported ColumnRecipe id variant: ${id}`);
}

export const ColumnRecipe: typeof ColumnRecipeBuild & {
  readonly getStatus: typeof ColumnRecipeGetStatus;
} = Object.assign(ColumnRecipeBuild, {
  getStatus: ColumnRecipeGetStatus,
});

/**
 * Type-guard for any recipe class — leaf {@link ColumnLazyImpl} or any of the
 * wrapper recipes ({@link ColumnDiscoveredRecipe}, {@link ColumnFilteredRecipe},
 * {@link ColumnOverriddenRecipe}). Use when a value may be a raw id, a `PColumn`,
 * or a recipe and you want to branch on the recipe case.
 */
export function isColumnRecipe(value: unknown): value is ColumnRecipe {
  return (
    value instanceof ColumnLazyImpl ||
    value instanceof ColumnDiscoveredRecipe ||
    value instanceof ColumnFilteredRecipe ||
    value instanceof ColumnOverriddenRecipe
  );
}
