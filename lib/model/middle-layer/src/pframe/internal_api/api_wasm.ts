import type {
  AxesId,
  AxesSpec,
  JoinEntry,
  PColumnSpec,
  PObjectId,
  PTableColumnId,
  PTableColumnSpec,
  PTableRecordFilter,
  PTableSorting,
  DataQuery,
  SpecQuery,
  SingleAxisSelector,
} from "@milaboratories/pl-model-common";
import type {
  DeleteColumnFromColumnsRequest,
  DeleteColumnFromColumnsResponse,
} from "./delete_column";
import type {
  DiscoverColumnsRequestV2,
  DiscoverColumnsResponse,
  DiscoverColumnsResponseV2,
} from "./discover_columns";
import type { FindColumnsRequest, FindColumnsResponse } from "./find_columns";

/**
 * V3 PFrame interface: same surface as V2 except `discoverColumns` returns
 * {@link DiscoverColumnsResponseV2}, which includes a per-hit ready-to-execute
 * {@link SpecQuery} alongside the existing fields.
 */
export interface PFrameWasmV3 extends Disposable {
  /**
   * Deletes columns from a columns specification.
   */
  deleteColumns(request: DeleteColumnFromColumnsRequest): DeleteColumnFromColumnsResponse;

  /**
   * Discovers columns compatible with a given axes integration, with separate
   * include and exclude filters. Exclude filter is applied after include,
   * removing matching columns from results.
   *
   * Each hit also carries a {@link SpecQuery} materializing its traversal
   * path — direct hits produce a plain column reference; linker-path hits
   * produce a nested `linkerJoin` chain ready to be evaluated.
   */
  discoverColumns(request: DiscoverColumnsRequestV2): DiscoverColumnsResponseV2;

  /**
   * Finds columns in the PFrame matching the given filter criteria.
   */
  findColumns(request: FindColumnsRequest): FindColumnsResponse;

  /**
   * Evaluates a query specification against this PFrame.
   */
  evaluateQuery(request: SpecQuery): EvaluateQueryResponse;

  /**
   * Rewrites a legacy query format (V4) to the current SpecQuery format.
   */
  rewriteLegacyQuery(request: LegacyQuery): SpecQuery;
}

/**
 * V3 PFrame API factory with createPFrame returning {@link PFrameWasmV3}.
 */
export interface PFrameWasmAPIV3 {
  /**
   * Creates a new V3 PFrame from a map of column IDs to column specifications.
   */
  createPFrame(spec: Record<string, PColumnSpec>): PFrameWasmV3;

  /**
   * Expands an {@link AxesSpec} into {@link AxesId}s with parent information
   * resolved.
   */
  expandAxes(spec: AxesSpec): AxesId;

  /**
   * Collapses {@link AxesId} into {@link AxesSpec}.
   */
  collapseAxes(ids: AxesId): AxesSpec;

  /**
   * Finds the index of an axis matching the given selector.
   * Returns -1 if no matching axis is found.
   */
  findAxis(spec: AxesSpec, selector: SingleAxisSelector): number;

  /**
   * Finds the flat index of a table column matching the given
   * selector within a table spec. Returns -1 if not found.
   */
  findTableColumn(tableSpec: PTableColumnSpec[], selector: PTableColumnId): number;
}

/**
 * V2 PFrame interface. Superseded by {@link PFrameWasmV3}, which adds a per-hit
 * {@link SpecQuery} to `discoverColumns` responses. Will be removed in a future
 * PFrames update.
 */
export interface PFrameWasmV2 extends Disposable {
  /** @see PFrameWasmV3.deleteColumns */
  deleteColumns(request: DeleteColumnFromColumnsRequest): DeleteColumnFromColumnsResponse;

  /** @see PFrameWasmV3.discoverColumns — V2 response lacks the per-hit `query` field. */
  discoverColumns(request: DiscoverColumnsRequestV2): DiscoverColumnsResponse;

  /** @see PFrameWasmV3.findColumns */
  findColumns(request: FindColumnsRequest): FindColumnsResponse;

  /** @see PFrameWasmV3.evaluateQuery */
  evaluateQuery(request: SpecQuery): EvaluateQueryResponse;

  /** @see PFrameWasmV3.rewriteLegacyQuery */
  rewriteLegacyQuery(request: LegacyQuery): SpecQuery;
}

/**
 * V2 PFrame API factory. Superseded by {@link PFrameWasmAPIV3}; will be removed
 * in a future PFrames update.
 */
export interface PFrameWasmAPIV2 {
  /** @see PFrameWasmAPIV3.createPFrame */
  createPFrame(spec: Record<string, PColumnSpec>): PFrameWasmV2;

  /** @see PFrameWasmAPIV3.expandAxes */
  expandAxes(spec: AxesSpec): AxesId;

  /** @see PFrameWasmAPIV3.collapseAxes */
  collapseAxes(ids: AxesId): AxesSpec;

  /** @see PFrameWasmAPIV3.findAxis */
  findAxis(spec: AxesSpec, selector: SingleAxisSelector): number;

  /** @see PFrameWasmAPIV3.findTableColumn */
  findTableColumn(tableSpec: PTableColumnSpec[], selector: PTableColumnId): number;
}

/**
 * Response from evaluating a query against a PFrame.
 */
export type EvaluateQueryResponse = {
  /**
   * The table specification describing the structure of the query result,
   * including all axes and columns that will be present in the output.
   */
  tableSpec: PTableColumnSpec[];
  /**
   * The data layer query representation with numeric indices,
   * suitable for execution by the data processing engine.
   */
  dataQuery: DataQuery;
};

/**
 * Represents a legacy (V4) query format used before the unified SpecQuery.
 *
 * This type is used with {@link PFrameWasmV3.rewriteLegacyQuery} to upgrade
 * older query structures to the current {@link SpecQuery} format.
 */
export type LegacyQuery = {
  /** The source join entry defining the data sources and join structure. */
  src: JoinEntry<PObjectId>;
  /** Optional record-level filters to apply to the query results. */
  filters?: PTableRecordFilter[];
  /** Optional sorting specifications for ordering the results. */
  sorting?: PTableSorting[];
};
