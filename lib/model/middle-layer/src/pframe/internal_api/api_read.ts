import { FindColumnsRequest, FindColumnsResponse } from './find_columns';
import { DeleteColumnFromColumnsRequest, DeleteColumnFromColumnsResponse } from './delete_column';
import {
  PColumnInfo,
  PColumnSpec,
  PObjectId,
  UniqueValuesRequest,
  UniqueValuesResponse
} from '@milaboratories/pl-model-common';
import { CreateTableRequestV4 } from './create_table';
import { PTableV7 } from './table';

/** Read interface exposed by PFrames library */
export interface PFrameReadAPIV10 {
  /**
   * Finds columns given filtering criteria on column name, annotations etc.
   * and a set of qualified axes specs to find only columns with compatible
   * axes spec.
   *
   * Only column specs are used, this method will work even for columns
   * with no assigned data.
   * */
  findColumns(request: FindColumnsRequest): Promise<FindColumnsResponse>;

  /**
   * Construct new axes integration with some entry removed but integration qualificaitons preserved.
   * Removes more then one entry in case the removal will create several disjoint sets of axes.
   */
  deleteColumn(request: DeleteColumnFromColumnsRequest): Promise<DeleteColumnFromColumnsResponse>;

  /** Retrieve single column spec */
  getColumnSpec(columnId: PObjectId): Promise<PColumnSpec>;

  /** Retrieve information about all columns currently added to the PFrame */
  listColumns(): Promise<PColumnInfo[]>;

  /** Calculates data for the table and returns an object to access it */
  createTable(request: CreateTableRequestV4): PTableV7;

  /** Calculate set of unique values for a specific axis for the filtered set of records */
  getUniqueValues(
    request: UniqueValuesRequest,
    ops?: {
      signal?: AbortSignal,
    }
  ): Promise<UniqueValuesResponse>;
}
