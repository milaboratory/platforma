import type { PTableColumnSpec } from './table_common';
import type { PTableShape, PTableVector, TableRange } from './data_types';

export type GetDataOptions = {
  range?: TableRange;
  signal?: AbortSignal;
};

/**
 * Table view.
 * */
export interface PTable {
  /** Unified table shape */
  getShape(): Promise<PTableShape>;

  /**
   * Returns ordered array of table axes specs (primary key "columns" in SQL
   * terms) and data column specs (regular "columns" in SQL terms).
   *
   * Data for a specific table column can be retrieved using unified indexing
   * corresponding to elements in this array.
   *
   * Axes are always listed first.
   * */
  getSpec(): Promise<PTableColumnSpec[]>;

  /**
   * Retrieve the data from the table. To retrieve only data required, it can be
   * sliced both horizontally ({@link columnIndices}) and vertically
   * ({@link range}).
   *
   * @param columnIndices unified indices of columns to be retrieved
   * @param range optionally limit the range of records to retrieve
   * */
  getData(
    columnIndices: number[],
    options?: GetDataOptions,
  ): Promise<PTableVector[]>;
  /** @deprecated Use {@link getData} with {@link GetDataOptions} instead */
  getData(
    columnIndices: number[],
    range?: TableRange,
  ): Promise<PTableVector[]>;
  getData(
    columnIndices: number[],
    optionsOrRange?: GetDataOptions | TableRange,
  ): Promise<PTableVector[]>;
}
