/**
 * Defines a step that vertically concatenates multiple tables from the tablespace
 * into a single output table. Columns are matched by name.
 */
export interface ConcatenateStep {
  /** The type identifier for this step. Must be 'concatenate'. */
  type: 'concatenate';

  /**
   * An array of input table names from the tablespace.
   * The tables are concatenated vertically in the order they appear in this array.
   */
  inputTables: string[];

  /** The name to be assigned to the newly created concatenated table in the tablespace. */
  outputTable: string;

  /**
   * Optional. A list of column names to select from all input tables.
   * If omitted, all columns from all input tables are included, and columns are matched by name.
   * If provided, only these specified columns will be included in the output table.
   * All input tables must contain all specified columns for the operation to succeed.
   */
  columns?: string[];
}
