import type {
  PObjectId,
  UniqueValuesResponse,
  DataQuery,
  DataQueryBooleanExpression,
} from "@milaboratories/pl-model-common";
import type { PTableV10 } from "./table";
import type { PTableId } from "./common";

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
 * Read interface exposed by PFrames library. Returns the {@link PTableV10}
 * table view, which provides the `export` method.
 *
 * Spec-side operations (finding columns, listing columns, retrieving
 * column specs, computing axis integrations) are not part of this
 * surface — callers cache column specs themselves or route through
 * WASM-spec. The data-side `createTable` accepts a pre-lowered
 * `DataQuery`; `getUniqueValues` takes pre-resolved indices via
 * {@link UniqueValuesRequestV2}.
 */
export interface PFrameReadAPIV13 {
  /** Creates table from a pre-lowered data query. */
  createTable(tableId: PTableId, dataQuery: DataQuery): PTableV10;

  /** Calculate set of unique values for a specific axis for the filtered set of records. */
  getUniqueValues(
    request: UniqueValuesRequestV2,
    ops?: {
      signal?: AbortSignal;
    },
  ): Promise<UniqueValuesResponse>;
}
