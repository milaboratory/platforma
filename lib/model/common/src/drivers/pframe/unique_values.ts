import { AxisId, PColumnId } from './spec';
import { PTableRecordFilter } from './table_calculate';
import { PTableVector } from './data';

/** Calculate set of unique values for a specific axis for the filtered set of records */
export interface UniqueValuesRequest {
  /** Target axis id */
  readonly columnId: PColumnId;

  /** Target axis id, if not specified calculates unique column values */
  readonly axis?: AxisId;

  /** Filters to apply before calculating unique values */
  readonly filters: PTableRecordFilter[];

  /** Max number of values to return, if reached response will contain overflow flag */
  readonly limit: number;
}

export interface UniqueValuesResponse {
  /** Unique values */
  readonly values: PTableVector;

  /** True if limit was reached and response contain non-exhaustive list of values. */
  readonly overflow: boolean;
}
