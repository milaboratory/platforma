import type {
  AxesId,
  AxesSpec,
  BuildQueryInput,
  JoinEntry,
  PColumnInfo,
  PColumnSpec,
  PObjectId,
  PTableColumnId,
  PTableColumnSpec,
  PTableRecordFilter,
  PTableSorting,
  DataQuery,
  SpecQuery,
  SpecQueryJoinEntry,
  SingleAxisSelector,
} from "@milaboratories/pl-model-common";
import type {
  DeleteColumnFromColumnsRequest,
  DeleteColumnFromColumnsResponse,
} from "./delete_column";
import type { DiscoverColumnsRequestV2, DiscoverColumnsResponse } from "./discover_columns";
import type { FindColumnsRequest, FindColumnsResponse } from "./find_columns";

/**
 * V3 PFrame interface — per-frame instance operations.
 *
 * Pure spec-assembly operations (e.g. {@link PFrameWasmAPIV3.buildQuery}) live
 * on the API factory because they don't read frame state. Everything here
 * consults the registered specs of this frame.
 */
export interface PFrameWasmV3 extends Disposable {
  /**
   * Deletes columns from a columns specification.
   */
  deleteColumns(request: DeleteColumnFromColumnsRequest): DeleteColumnFromColumnsResponse;

  /**
   * Lists all columns currently registered in this PFrame, with their ids and specs.
   */
  listColumns(): PColumnInfo[];

  /**
   * Discovers columns compatible with a given axes integration. Include and
   * exclude filters are applied in order (exclude removes matches from the
   * include set). Each hit carries its traversal `path`; feed the hit's
   * column id and `path` into {@link PFrameWasmAPIV3.buildQuery} to
   * materialize it as a {@link SpecQueryJoinEntry}.
   */
  discoverColumns(request: DiscoverColumnsRequestV2): DiscoverColumnsResponse;

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
 * V3 PFrame API factory — pure spec-layer operations plus frame construction.
 * Everything here is stateless and does not require a frame instance.
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

  /**
   * Assembles a {@link SpecQueryJoinEntry} from a terminal column plus an
   * ordered path of wrapping steps (linker hops, filter joins).
   *
   * Right-fold over `path` starting from `Column(column)`: each `linker` step
   * wraps the current subquery as `linkerJoin`, each `filter` step as
   * `innerJoin` with the filter column. `qualifications` annotate the
   * outermost entry only.
   *
   * Pure over its input — no frame needed. Column ids are resolved later at
   * {@link PFrameWasmV3.evaluateQuery} against the registered specs. Throws
   * only on malformed input: shape violations and unknown step tags (so v1
   * callers are shielded from step variants added in later versions).
   */
  buildQuery(input: BuildQueryInput): SpecQueryJoinEntry;
}

/**
 * V2 PFrame interface. Kept as a legacy shim while pframes-rs-wasm still
 * exposes this as the return type of `createPFrame`; will be removed once
 * the V3 surface (with `listColumns` and factory-level `buildQuery`) is
 * implemented on the pframes-rs side.
 */
export interface PFrameWasmV2 extends Disposable {
  /** @see PFrameWasmV3.deleteColumns */
  deleteColumns(request: DeleteColumnFromColumnsRequest): DeleteColumnFromColumnsResponse;

  /** @see PFrameWasmV3.discoverColumns */
  discoverColumns(request: DiscoverColumnsRequestV2): DiscoverColumnsResponse;

  /** @see PFrameWasmV3.findColumns */
  findColumns(request: FindColumnsRequest): FindColumnsResponse;

  /** @see PFrameWasmV3.evaluateQuery */
  evaluateQuery(request: SpecQuery): EvaluateQueryResponse;

  /** @see PFrameWasmV3.rewriteLegacyQuery */
  rewriteLegacyQuery(request: LegacyQuery): SpecQuery;
}

/**
 * V2 PFrame API factory. Kept as a legacy shim while pframes-rs-wasm still
 * returns this from its top-level exports; will be removed once the V3
 * surface is implemented on the pframes-rs side.
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
