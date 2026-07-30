import type { PColumn } from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../../render";
import type { PColumnDataUniversal } from "../../render/internal";
import type { DataColumn } from "../data_column";
import type { ColumnRecipe } from "../column_recipes";
import type { ColumnsProvider } from "./providers";

/**
 * Union of types that can serve as column sources for helpers and builders.
 * Includes TreeNodeAccessor, ColumnsProvider, and arrays of columns.
 *
 * The array form accepts plain {@link PColumn}s (materialized snapshots),
 * {@link DataColumn} leaves, or any {@link ColumnRecipe} — builders only
 * need each entry's `id` for serialization.
 */
export type ColumnsSource =
  | ColumnsProvider
  | TreeNodeAccessor
  | {
      readonly columns: ReadonlyArray<
        PColumn<undefined | PColumnDataUniversal> | DataColumn | ColumnRecipe
      >;
      readonly isFinal: boolean;
    };
