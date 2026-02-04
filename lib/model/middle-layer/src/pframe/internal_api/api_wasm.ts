import type {
  AxesId,
  AxesSpec,
  JoinEntry,
  PColumnSpec,
  PObjectId,
  PTableColumnSpec,
  PTableRecordFilter,
  PTableSorting,
  QueryData,
  QuerySpec,
  SingleAxisSelector,
} from '@milaboratories/pl-model-common';
import type {
  DeleteColumnFromColumnsRequest,
  DeleteColumnFromColumnsResponse,
} from './delete_column';
import type {
  FindColumnsRequest,
  FindColumnsResponse,
} from './find_columns';

export interface PFrameWasmAPI {
  /**
   * Creates a new PFrame from a map of column IDs to column specifications.
   */
  createPFrame(spec: Record<string, PColumnSpec>): PFrameWasm;

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
   */
  findAxis(spec: AxesSpec, selector: SingleAxisSelector): number;
};

/**
 * A PFrame represents a collection of columns that can be queried and joined.
 */
export interface PFrameWasm extends Disposable {
  /**
   * Deletes columns from a columns specification.
   */
  deleteColumns(
    request: DeleteColumnFromColumnsRequest
  ): DeleteColumnFromColumnsResponse;

  /**
   * Finds columns in the PFrame matching the given filter criteria.
   */
  findColumns(
    request: FindColumnsRequest
  ): FindColumnsResponse;
  /**
   * Evaluates a query specification against this PFrame.
   *
   * Takes a QuerySpec (which can represent columns, joins, filters, sorts,
   * etc.) and returns the resulting table specification along with the data
   * layer query representation.
   */
  evaluateQuery(
    request: QuerySpec
  ): EvaluateQueryResponse;

  /**
   * Rewrites a legacy query format (V4) to the current QuerySpec format.
   *
   * This method upgrades older query structures that use JoinEntryV4, filters,
   * and sorting into the new unified QuerySpec format with proper filter and
   * sort query nodes.
   */
  rewriteLegacyQuery(
    request: LegacyQuery
  ): QuerySpec;
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
  joinEntry: QueryData;
};

/**
 * Represents a legacy (V4) query format used before the unified QuerySpec.
 *
 * This type is used with {@link PFrameWasm.rewriteLegacyQuery} to upgrade
 * older query structures to the current {@link QuerySpec} format.
 */
export type LegacyQuery = {
  /** The source join entry defining the data sources and join structure. */
  src: JoinEntry<PObjectId>;
  /** Optional record-level filters to apply to the query results. */
  filters?: PTableRecordFilter[];
  /** Optional sorting specifications for ordering the results. */
  sorting?: PTableSorting[];
};
