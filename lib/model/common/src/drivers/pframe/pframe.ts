import { PObjectId } from '../../pool';
import { FindColumnsRequest, FindColumnsResponse } from './find_columns';
import { PColumnIdAndSpec, PColumnSpec } from './spec';
import { CalculateTableDataRequest, CalculateTableDataResponse } from './table_calculate';
import { UniqueValuesRequest, UniqueValuesResponse } from './unique_values';

/** Read interface exposed by PFrames library */
export interface PFrame {
  /**
   * Finds columns given filtering criteria on column name, annotations etc.
   * and a set of axes ids to find only columns with compatible specs.
   * */
  findColumns(request: FindColumnsRequest): Promise<FindColumnsResponse>;

  /** Retrieve single column spec */
  getColumnSpec(columnId: PObjectId): Promise<PColumnSpec>;

  /** Retrieve information about all columns currently added to the PFrame */
  listColumns(): Promise<PColumnIdAndSpec[]>;

  /** Calculates data for the table and returns complete data representation of it */
  calculateTableData(request: CalculateTableDataRequest): Promise<CalculateTableDataResponse>;

  /** Calculate set of unique values for a specific axis for the filtered set of records */
  getUniqueValues(request: UniqueValuesRequest): Promise<UniqueValuesResponse>;
}
