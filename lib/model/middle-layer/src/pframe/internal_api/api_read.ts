import type { FindColumnsRequest, FindColumnsResponse } from "./find_columns";
import type {
  DeleteColumnFromColumnsRequest,
  DeleteColumnFromColumnsResponse,
} from "./delete_column";
import type {
  PColumnInfo,
  PColumnSpec,
  PObjectId,
  UniqueValuesRequest,
  UniqueValuesResponse,
  DataQuery,
  DataQueryBooleanExpression,
  PTableColumnSpec,
} from "@milaboratories/pl-model-common";
import type { CreateTableRequestV4 } from "./create_table";
import type { PTableV8, PTableV9 } from "./table";
import type { PTableId } from "./common";

/** Read interface exposed by PFrames library */
export interface PFrameReadAPIV11 {
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
  getColumnSpec(columnId: PObjectId): Promise<PColumnSpec | null>;

  /** Retrieve information about all columns currently added to the PFrame */
  listColumns(): Promise<PColumnInfo[]>;

  /** Calculates data for the table and returns an object to access it */
  createTable(tableId: PTableId, request: CreateTableRequestV4): PTableV8;

  /** Creates table from data query and returns an object to access it */
  createTableV2(
    tableId: PTableId,
    request: {
      tableSpec: PTableColumnSpec[];
      dataQuery: DataQuery;
    },
  ): PTableV8;

  /** Calculate set of unique values for a specific axis for the filtered set of records */
  getUniqueValues(
    request: UniqueValuesRequest,
    ops?: {
      signal?: AbortSignal;
    },
  ): Promise<UniqueValuesResponse>;
}

/**
 * V2 unique-values request. Axis and filter references are
 * pre-resolved to numeric indices; no selector ids cross the API
 * boundary. Each filter is a boolean predicate that must evaluate to
 * true for the row to be included.
 */
export interface UniqueValuesRequestV2 {
  /** Target column. */
  readonly columnId: PObjectId;

  /**
   * Target axis (pre-resolved index into the column's axes).
   * When omitted, unique values are collected from the column itself.
   */
  readonly axisIndex?: number;

  /** Pre-resolved boolean predicates applied before collecting values. */
  readonly filters: DataQueryBooleanExpression[];

  /** Max number of values to return. Overflow is reported in the response. */
  readonly limit: number;
}

/**
 * Read interface exposed by PFrames library.
 *
 * Spec-side operations (finding columns, listing columns, retrieving
 * column specs, computing axis integrations) are not part of this
 * surface — callers cache column specs themselves or route through
 * WASM-spec. The data-side `createTableV2` accepts a pre-lowered
 * `DataQuery`; `getUniqueValues` takes pre-resolved indices via
 * {@link UniqueValuesRequestV2}.
 */
export interface PFrameReadAPIV12 {
  /** Creates table from a pre-lowered data query. */
  createTableV2(tableId: PTableId, dataQuery: DataQuery): PTableV9;

  /** Calculate set of unique values for a specific axis for the filtered set of records. */
  getUniqueValues(
    request: UniqueValuesRequestV2,
    ops?: {
      signal?: AbortSignal;
    },
  ): Promise<UniqueValuesResponse>;
}
