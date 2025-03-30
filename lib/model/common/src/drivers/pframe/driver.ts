import type { Branded } from '../../branding';
import type { PTable } from './table';
import type { PFrame } from './pframe';
import type { AddParameterToAllMethods } from './type_util';
import type { PTableShape, PTableVector, TableRange } from './data_types';
import type { FindColumnsRequest, FindColumnsResponse } from './find_columns';
import type { PObjectId } from '../../pool';
import type { PColumnIdAndSpec, PColumnSpec } from './spec/spec';
import type {
  CalculateTableDataRequest,
  CalculateTableDataResponse,
} from './table_calculate';
import type { UniqueValuesRequest, UniqueValuesResponse } from './unique_values';
import type { PTableColumnSpec } from './table_common';

/** PFrame handle */
export type PFrameHandle = Branded<string, 'PFrame'>;

/** PFrame handle */
export type PTableHandle = Branded<string, 'PTable'>;

/** Allows to access main data layer features of platforma */
export interface PFrameDriver {
  //
  // PFrame methods
  //

  /**
   * Finds columns given filtering criteria on column name, annotations etc.
   * and a set of axes ids to find only columns with compatible specs.
   * */
  findColumns(
    handle: PFrameHandle,
    request: FindColumnsRequest
  ): Promise<FindColumnsResponse>;

  /** Retrieve single column spec */
  getColumnSpec(
    handle: PFrameHandle,
    columnId: PObjectId
  ): Promise<PColumnSpec>;

  /** Retrieve information about all columns currently added to the PFrame */
  listColumns(handle: PFrameHandle): Promise<PColumnIdAndSpec[]>;

  /** Calculates data for the table and returns complete data representation of it */
  calculateTableData(
    handle: PFrameHandle,
    request: CalculateTableDataRequest<PObjectId>
  ): Promise<CalculateTableDataResponse>;

  /** Calculate set of unique values for a specific axis for the filtered set of records */
  getUniqueValues(
    handle: PFrameHandle,
    request: UniqueValuesRequest
  ): Promise<UniqueValuesResponse>;

  //
  // PTable methods
  //

  /** Unified table shape */
  getShape(handle: PTableHandle): Promise<PTableShape>;

  /**
   * Returns ordered array of table axes specs (primary key "columns" in SQL
   * terms) and data column specs (regular "columns" in SQL terms).
   *
   * Data for a specific table column can be retrieved using unified indexing
   * corresponding to elements in this array.
   *
   * Axes are always listed first.
   * */
  getSpec(handle: PTableHandle): Promise<PTableColumnSpec[]>;

  /**
   * Retrieve the data from the table. To retrieve only data required, it can be
   * sliced both horizontally ({@link columnIndices}) and vertically
   * ({@link range}).
   *
   * @param columnIndices unified indices of columns to be retrieved
   * @param range optionally limit the range of records to retrieve
   * */
  getData(
    handle: PTableHandle,
    columnIndices: number[],
    range?: TableRange
  ): Promise<PTableVector[]>;
}

//
// The following keeps the PFrame driver from above to be in sync with
// PFrame and PTable interfaces.
//

type ExpectedPFrameDriverTypeF = AddParameterToAllMethods<
  PFrame,
  [handle: PFrameHandle]
>;
type ExpectedPFrameDriverTypeT = AddParameterToAllMethods<
  PTable,
  [handle: PTableHandle]
>;
type ExpectedPFrameDriverType = ExpectedPFrameDriverTypeF &
  ExpectedPFrameDriverTypeT;

type TypeEqualityGuard<A, B> = Exclude<A, B> | Exclude<B, A>;
function assert<_T extends never>() {}

assert<TypeEqualityGuard<PFrameDriver, ExpectedPFrameDriverType>>();
