import type { Expression } from './expressions';

/**
 * Defines a single sort instruction, specifying the column, sort order,
 * and null handling strategy.
 */
export interface SortDirective {
  /** The expression to sort by. */
  value: Expression;

  /**
   * Whether to sort in descending order for this column.
   * Defaults to false (ascending).
   */
  descending?: boolean;

  /**
   * Determines how null values are handled in the sort for this column.
   * If true, nulls are placed last.
   * If false, nulls are placed first.
   * If undefined, the default Polars behavior is used (nulls are considered smallest,
   * so they appear first in ascending sorts and last in descending sorts, unless platform defaults differ).
   * This maps to Polars' `nulls_last` parameter.
   */
  nullsLast?: boolean;
}

/**
 * Defines a step that sorts a table based on one or more column directives.
 * The operation reads from an input table and writes the sorted result to an output table.
 */
export interface SortStep {
  /** The type identifier for this step. Must be 'sort'. */
  type: 'sort';

  /** The name of the input table from the tablespace to be sorted. */
  inputTable: string;

  /** The name to be assigned to the newly created sorted table in the tablespace. */
  outputTable: string;

  /**
   * An array of sort directives defining the columns and their respective sort orders.
   * The table is sorted by the first directive in the array, then by the second
   * for any ties, and so on.
   */
  by: SortDirective[];

  /**
   * Optional. If true, maintains the stability of the sort. This means that if
   * two rows are equivalent according to the sorting criteria, their relative order
   * from the input table is preserved in the output.
   * Corresponds to `maintain_order=True` in Polars `DataFrame.sort()`.
   * Defaults to false.
   */
  stable?: boolean;
}
