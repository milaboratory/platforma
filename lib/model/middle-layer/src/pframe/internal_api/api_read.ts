import type {
  PObjectId,
  UniqueValuesResponse,
  DataQuery,
  DataQueryBooleanExpression,
} from "@milaboratories/pl-model-common";
import type { PTableV11, PTableV12 } from "./table";
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
 * Read interface exposed by PFrames library. Returns the {@link PTableV12}
 * table view, whose `export` takes an `ops.headers` list of
 * `[column index, header name]` pairs.
 *
 * Self-contained: does not extend any earlier read interface. Once this
 * version is adopted, every earlier `PFrameReadAPIV*` and per-table
 * `PTableV*` interface is dropped, so this declaration repeats the full
 * method surface rather than referencing the predecessors.
 *
 * Same surface as {@link PFrameReadAPIV14}; the only change is that
 * {@link PFrameReadAPIV15.createTable} returns {@link PTableV12}.
 *
 * Spec-side operations (finding columns, listing columns, retrieving
 * column specs, computing axis integrations) are not part of this
 * surface — callers cache column specs themselves or route through
 * WASM-spec. The data-side `createTable` accepts a pre-lowered
 * `DataQuery`; `getUniqueValues` takes pre-resolved indices via
 * {@link UniqueValuesRequestV2}.
 */
export interface PFrameReadAPIV15 {
  /** Creates table from a pre-lowered data query. */
  createTable(tableId: PTableId, dataQuery: DataQuery): PTableV12;

  /** Calculate set of unique values for a specific axis for the filtered set of records. */
  getUniqueValues(
    request: UniqueValuesRequestV2,
    ops?: {
      signal?: AbortSignal;
    },
  ): Promise<UniqueValuesResponse>;
}

/**
 * Read interface exposed by PFrames library. Returns the {@link PTableV11}
 * table view, whose `export` takes a column-index → header map.
 *
 * Spec-side operations (finding columns, listing columns, retrieving
 * column specs, computing axis integrations) are not part of this
 * surface — callers cache column specs themselves or route through
 * WASM-spec. The data-side `createTable` accepts a pre-lowered
 * `DataQuery`; `getUniqueValues` takes pre-resolved indices via
 * {@link UniqueValuesRequestV2}.
 */
export interface PFrameReadAPIV14 {
  /** Creates table from a pre-lowered data query. */
  createTable(tableId: PTableId, dataQuery: DataQuery): PTableV11;

  /** Calculate set of unique values for a specific axis for the filtered set of records. */
  getUniqueValues(
    request: UniqueValuesRequestV2,
    ops?: {
      signal?: AbortSignal;
    },
  ): Promise<UniqueValuesResponse>;
}
