import { FindColumnsRequest, FindColumnsResponse } from './find_columns';
import { PColumnId, PColumnIdAndSpec, PColumnSpec } from './spec';
import { CalculateTableDataRequest, CalculateTableDataResponse } from './table_calculate';

/** Read interface exposed by PFrames library */
export interface PFrame {
  /**
   * Finds columns given filtering criteria on column name, annotations etc.
   * and a set of axes ids to find only columns with compatible specs.
   * */
  findColumns(request: FindColumnsRequest): Promise<FindColumnsResponse>;

  /** Retrieve single column spec */
  getColumnSpec(columnId: PColumnId): Promise<PColumnSpec>;

  /** Retrieve information about all columns currently added to the PFrame */
  listColumns(): Promise<PColumnIdAndSpec[]>;

  /** Calculates data for the table and returns complete data representation of it */
  calculateTableData(request: CalculateTableDataRequest): Promise<CalculateTableDataResponse>;
}
