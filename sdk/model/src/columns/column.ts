import {
  type ColumnUniversalId,
  type LeafEntry,
  type PColumn,
  type PlRef,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx } from "../render/internal";
import type { TreeNodeAccessor } from "../render";
import { DataColumn, type ColumnData } from "./data_column";
import { ColumnRecipe, ColumnRecipeId, isColumnRecipe } from "./column_recipes";

export type ColumnSource =
  | PObjectId
  | ColumnUniversalId
  | PlRef
  | LeafEntry<TreeNodeAccessor>
  | PColumn<ColumnData>
  | DataColumn<PObjectId>;

/**
 * Unified entry point — routes between the two top-level dispatchers:
 *   - string id (`PObjectId` / `ColumnUniversalId`) → {@link ColumnRecipe}
 *   - object source (`PlRef` / `LeafEntry` / `PColumn` / `DataColumn`) → {@link DataColumn}
 *
 * `DataColumn` is itself a `ColumnRecipe<PObjectId>`, so the return type is
 * the common `ColumnRecipe`.
 */
export function Column(
  source: ColumnSource,
  opts?: { ctx?: GlobalCfgRenderCtx },
): undefined | ColumnRecipe {
  if (typeof source === "string") return ColumnRecipe(source, opts);
  return DataColumn(source, opts);
}

export type Column<ID extends ColumnRecipeId = ColumnRecipeId> = ColumnRecipe<ID>;

/**
 * Type-guard for the `Column` type — currently aliased to `ColumnRecipe`, so
 * this is equivalent to {@link isColumnRecipe}. Kept as a separate export to
 * mirror the `Column` / `ColumnRecipe` / `DataColumn` factory triple.
 */
export function isColumn(value: unknown): value is Column {
  return isColumnRecipe(value);
}
