import {
  PTableColumnId,
  PTableColumnSpec,
  PTableRecordFilter,
  PTableShape,
  PTableSorting,
  PTableVector,
  TableRange
} from '@milaboratories/pl-model-common';

/**
 * Table view returned as a result of create table operation.
 *
 * PTable can be thought as having a composite primary key, consisting of axes,
 * and a set of data columns derived from PColumn values.
 * */
export interface PTableV5 {
  /**
   * Returns ordered array of table axes specs (primary key "columns" in SQL
   * terms) and data column specs (regular "columns" in SQL terms).
   *
   * Data for a specific table column can be retrieved using unified indexing
   * corresponding to elements in this array.
   *
   * Axes are always listed first.
   * */
  getSpec(): PTableColumnSpec[];

  /** Transforms unified column identifiers into unified indices of columns. */
  getColumnIndices(columnIds: PTableColumnId[]): number[];

  /**
   * Unified table shape
   * Warning: This call materializes the join.
   */
  getShape(ops?: {
    signal?: AbortSignal,
  }): Promise<PTableShape>;

  /**
   * Retrieve the data from the table. To retrieve only data required, it can be
   * sliced both horizontally ({@link columnIndices}) and vertically
   * ({@link range}).
   * This call materializes the join.
   *
   * @param columnIndices unified indices of columns to be retrieved
   * @param range optionally limit the range of records to retrieve
   * */
  getData(
    columnIndices: number[],
    ops?: {
      range?: TableRange,
      signal?: AbortSignal,
    },
  ): Promise<PTableVector[]>;

  /** Filters the table and returns new PTable instance */
  filter(request: PTableRecordFilter[]): PTableV5;

  /** Sorts the table and returns new PTable instance. */
  sort(request: PTableSorting[]): PTableV5;

  /** Deallocates all underlying resources */
  dispose(): void;
}
