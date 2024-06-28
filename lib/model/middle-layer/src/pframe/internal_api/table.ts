import { PTableColumnSpec, PTableVector, TableRange } from '@milaboratory/sdk-model';

/** Unified information about table shape */
export type PTableShape = {
  /** Number of unified table columns, including all axes and PColumn values */
  columns: number

  /** Number of rows */
  rows: number
}

/** Sorting parameters to be used by {@link PTable.sort} method.  */
export type PTableSortingRequest = {
  /** Unified column index */
  columnIndex: number;

  /** Sorting order */
  ascending: boolean;

  /** Sorting in respect to NA and absent values */
  naAndAbsentAreLeastValues: boolean;
}

/**
 * Table view returned as a result of create table operation.
 *
 * PTable can be thought as having a composite primary key, consisting of axes,
 * and a set of data columns derived from PColumn values.
 * */
export interface PTable {
  /** Unified table shape */
  getShape(): PTableShape;

  /**
   * Returns ordered array of table axes specs (primary key "columns" in SQL
   * terms) and data column specs (regular "columns" in SQL terms).
   *
   * Data for a specific table column can be retrieved using unified indexing
   * corresponding to elements in this array.
   * */
  getSpec(): PTableColumnSpec[];

  /**
   * Retrieve the data from the table. To retrieve only data required, it can be
   * sliced both horizontally ({@link columnIndices}) and vertically
   * ({@link range}).
   *
   * @param columnIndices unified indices of columns to be retrieved
   * @param range optionally limit the range of records to retrieve */
  getData(columnIndices: number[], range?: TableRange): Promise<PTableVector[]>;

  /** Sorts the table and returns new PTable instance. */
  sort(request: PTableSortingRequest[]): Promise<PTable>;
}
