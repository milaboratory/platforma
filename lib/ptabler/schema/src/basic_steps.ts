import type { Expression } from './expressions';

/**
 * Defines a step that adds one or more new columns to an existing table in the tablespace.
 * This operation modifies the specified table in place.
 */
export interface AddColumnsStep {
  /**
   * The type identifier for this step.
   * Must be 'add_columns'.
   */
  type: 'add_columns';

  /**
   * The name of the target DataFrame in the tablespace to which columns will be added.
   */
  table: string;

  /**
   * An array defining the new columns to be added.
   * Each object in the array specifies the name of a new column and the expression to compute its values.
   */
  columns: Expression[];
}

/**
 * Defines a step that filters rows in a table based on a specified condition
 * and outputs the result to a new table in the tablespace.
 */
export interface FilterStep {
  /**
   * The type identifier for this step.
   * Must be 'filter'.
   */
  type: 'filter';

  /**
   * The name of the input table in the tablespace from which rows will be filtered.
   */
  inputTable: string;

  /**
   * The name for the resulting filtered table that will be added to the tablespace.
   * This new table will contain only the rows that satisfy the condition.
   */
  outputTable: string;

  /**
   * A boolean Expression object used as the filter condition.
   * Rows for which this expression evaluates to true are kept in the outputTable.
   * Rows for which it evaluates to false or null are excluded.
   */
  condition: Expression;
}

/**
 * Defines a step that selects a specific set of columns from an input table,
 * potentially applying transformations or creating new columns, and outputs
 * the result to a new table in the tablespace. This operation is similar
 * to Polars' `select` method.
 */
export interface SelectStep {
  /**
   * The type identifier for this step.
   * Must be 'select'.
   */
  type: 'select';

  /**
   * The name of the input table in the tablespace from which columns will be selected.
   */
  inputTable: string;

  /**
   * The name for the resulting table that will be added to the tablespace.
   * This new table will contain only the columns defined in the 'columns' array.
   */
  outputTable: string;

  /**
   * An array defining the columns for the output table.
   * Each object in the array specifies the name of a column in the output table
   * and the expression to compute its values.
   */
  columns: Expression[];
}

/**
 * Defines a step that adds new columns to an input table (or replaces existing ones
 * if names collide) and outputs the result to a new table in the tablespace.
 * This operation is similar to Polars' `with_columns` method.
 */
export interface WithColumnsStep {
  /**
   * The type identifier for this step.
   * Must be 'with_columns'.
   */
  type: 'with_columns';

  /**
   * The name of the input table in the tablespace to which columns will be added.
   */
  inputTable: string;

  /**
   * The name for the resulting table that will be added to the tablespace.
   * This new table will contain all original columns from the inputTable,
   * plus the new columns defined here (or with existing columns replaced by
   * new ones if names match).
   */
  outputTable: string;

  /**
   * An array defining the new or replacement columns.
   * Each object in the array specifies the name of a column and the
   * expression to compute its values.
   */
  columns: Expression[];
}

/**
 * Defines a step that excludes a specific set of columns from an input table
 * and outputs the result to a new table in the tablespace. This operation is
 * similar to Polars' `exclude` method.
 */
export interface WithoutColumnsStep {
  /**
   * The type identifier for this step.
   * Must be 'without_columns'.
   */
  type: 'without_columns';

  /**
   * The name of the input table in the tablespace from which columns will be excluded.
   */
  inputTable: string;

  /**
   * The name for the resulting table that will be added to the tablespace.
   * This new table will contain all columns from the inputTable except those specified.
   */
  outputTable: string;

  /**
   * An array of column names to be excluded from the input table.
   */
  columns: string[];
}

/**
 * Defines a step that limits the number of rows in a table
 * and outputs the result to a new table in the tablespace.
 * This operation is similar to Polars' `limit` method.
 */
export interface LimitStep {
  /**
   * The type identifier for this step.
   * Must be 'limit'.
   */
  type: 'limit';

  /**
   * The name of the input table in the tablespace from which rows will be limited.
   */
  inputTable: string;

  /**
   * The name for the resulting table that will be added to the tablespace.
   * This new table will contain only the first n rows from the input table.
   */
  outputTable: string;

  /**
   * The maximum number of rows to include in the output table.
   */
  n: number;
}
