import { FindColumnsRequest, FindColumnsResponse } from './find_columns';
import { DeleteColumnFromColumnsRequest, DeleteColumnFromColumnsResponse } from './delete_column';
import {
  PColumnInfo,
  PColumnSpec,
  PObjectId,
  UniqueValuesRequest,
  UniqueValuesResponse
} from '@milaboratories/pl-model-common';
import { CreateTableRequestV3 } from './create_table';
import { PTableV6 } from './table';

/** Read interface exposed by PFrames library */
export interface PFrameReadAPIV8 {
  /**
   * Finds columns given filtering criteria on column name, annotations etc.
   * and a set of qualified axes specs to find only columns with compatible
   * axes spec.
   *
   * Only column specs are used, this method will work even for columns
   * with no assigned data.
   * */
  findColumns(request: FindColumnsRequest): Promise<FindColumnsResponse>;

  /** To be reviewed in the future */
  deleteColumn(request: DeleteColumnFromColumnsRequest): Promise<DeleteColumnFromColumnsResponse>;

  /** Retrieve single column spec */
  getColumnSpec(columnId: PObjectId): Promise<PColumnSpec>;

  /** Retrieve information about all columns currently added to the PFrame */
  listColumns(): Promise<PColumnInfo[]>;

  /** Calculates data for the table and returns an object to access it */
  createTable(request: CreateTableRequestV3): PTableV6;

  /** Calculate set of unique values for a specific axis for the filtered set of records */
  getUniqueValues(
    request: UniqueValuesRequest,
    ops?: {
      signal?: AbortSignal,
    }
  ): Promise<UniqueValuesResponse>;
}
