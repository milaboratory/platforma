/**
 * Defines the structure for mapping a column, with an optional rename.
 */
export interface ColumnMapping {
  /** The original name of the column. */
  column: string;
  /** The new name for the column. If absent, the original name is used. */
  rename?: string;
}

/**
 * Defines the type for join operations (excluding cross join) in a workflow.
 * This step joins two tables from the tablespace based on specified columns and join strategy.
 */
export interface JoinStep {
  /** The type of the step, which is always "join" for this operation. */
  type: 'join';

  /** The name of the left table in the tablespace to be joined. */
  leftTable: string;

  /** The name of the right table in the tablespace to be joined. */
  rightTable: string;

  /** The name to be assigned to the resulting joined table in the tablespace. */
  outputTable: string;

  /** A list of column names from the left table to be used for the equi-join, original not mapped names. */
  leftOn: string[];

  /** A list of column names from the right table to be used for the equi-join, original not mapped names. */
  rightOn: string[];

  /** The type of join to perform. */
  how: JoinStrategy;

  /**
   * Determines how to handle key columns with the same name from both the left and right tables after the join.
   * When set to \`true\` (the default), Polars will attempt to merge these identically named key columns into a single column in the output table.
   * For 'inner', 'left', and 'right' joins, this is the standard behavior.
   * For 'full' joins, setting this to \`true\` ensures the key columns are coalesced.
   * When set to \`false\`, identically named key columns from the left and right tables will be kept separate in the output,
   * with the column from the right table typically being renamed (e.g., by adding a suffix like '_right').
   * This parameter mirrors the behavior of Polars' join coalescing logic.
   * It does not apply to 'cross' joins, as they do not involve key columns in the same way.
   */
  coalesce?: boolean;

  /**
   * An optional list to select and rename columns from the left table.
   * If provided, only these columns (plus any from `leftOn` not explicitly listed) will be included.
   * Use the `rename` property within a mapping to change a column's name.
   */
  leftColumns?: ColumnMapping[];

  /**
   * An optional list to select and rename columns from the right table.
   * If provided, only these columns (plus any from `rightOn` not explicitly listed) will be included.
   * Use the `rename` property within a mapping to change a column's name.
   */
  rightColumns?: ColumnMapping[];
}

/**
 * Defines the type for a cross join operation in a workflow.
 * This step computes the Cartesian product of two tables.
 */
export interface CrossJoinStep {
  /** The type of the step, which is always "join" for this operation. */
  type: 'join'; // Or should this be 'cross_join'? For now, keeping it 'join' as per user doc for steps having a 'type'.

  /** The name of the left table in the tablespace to be joined. */
  leftTable: string;

  /** The name of the right table in the tablespace to be joined. */
  rightTable: string;

  /** The name to be assigned to the resulting joined table in the tablespace. */
  outputTable: string;

  /** The type of join to perform, which is always "cross" for this operation. */
  how: 'cross';

  /**
   * An optional list to select and rename columns from the left table.
   * If provided, only these columns will be included.
   * Use the `rename` property within a mapping to change a column's name.
   */
  leftColumns?: ColumnMapping[];

  /**
   * An optional list to select and rename columns from the right table.
   * If provided, only these columns will be included.
   * Use the `rename` property within a mapping to change a column's name.
   */
  rightColumns?: ColumnMapping[];
}

/** Defines the possible join strategies for a standard join operation (excluding cross join). */
export type JoinStrategy = 'inner' | 'left' | 'right' | 'full';

/** Defines any possible join step. */
export type AnyJoinStep = JoinStep | CrossJoinStep;
