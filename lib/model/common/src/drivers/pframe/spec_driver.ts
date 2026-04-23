import type { Branded } from "@milaboratories/helpers";
import type { PoolEntry } from "../../pool_entry";
import type { PObjectId } from "../../pool";
import type {
  AxisSpec,
  AxesSpec,
  AxesId,
  PColumnIdAndSpec,
  PColumnSpec,
  SingleAxisSelector,
  AxisValueType,
  ColumnValueType,
} from "./spec";
import type { PTableColumnId, PTableColumnSpec } from "./table_common";
import { DataQuery, SpecQuery } from "./query";

/** Matches a string value either exactly or by regex pattern */
export type StringMatcher =
  | {
      type: "exact";
      value: string;
    }
  | {
      type: "regex";
      value: string;
    };

/** Map of key to array of string matchers (OR-ed per key, AND-ed across keys) */
export type MatcherMap = Record<string, StringMatcher[]>;

/** Selector for matching axes by various criteria */
export interface MultiAxisSelector {
  /** Match any of the axis types listed here */
  readonly type?: AxisValueType[];
  /** Match any of the axis names listed here */
  readonly name?: StringMatcher[];
  /** Match requires all the domains listed here */
  readonly domain?: MatcherMap;
  /** Match requires all the context domains listed here */
  readonly contextDomain?: MatcherMap;
  /** Match requires all the annotations listed here */
  readonly annotations?: MatcherMap;
}

/** Column selector for discover columns request, matching columns by various criteria.
 * Multiple selectors are OR-ed: a column matches if it satisfies any selector. */
export interface MultiColumnSelector {
  /** Match any of the value types listed here */
  readonly type?: ColumnValueType[];
  /** Match any of the names listed here */
  readonly name?: StringMatcher[];
  /** Match requires all the domains listed here */
  readonly domain?: MatcherMap;
  /** Match requires all the context domains listed here */
  readonly contextDomain?: MatcherMap;
  /** Match requires all the annotations listed here */
  readonly annotations?: MatcherMap;
  /** Match any of the axis selectors listed here */
  readonly axes?: MultiAxisSelector[];
  /** When true (default), allows matching if only a subset of axes match */
  readonly partialAxesMatch?: boolean;
}

/** Qualification applied to a single axis to make it compatible during integration. */
export interface AxisQualification {
  /** Axis selector identifying which axis is qualified. */
  readonly axis: SingleAxisSelector;
  /** Additional context domain entries applied to the axis. */
  readonly contextDomain: Record<string, string>;
}

/** Qualifications needed for both query (already-integrated) columns and the hit column. */
export interface ColumnAxesWithQualifications {
  /** Already integrated (query) columns with their qualifications. */
  axesSpec: AxisSpec[];
  /** Qualifications for each already integrated (query) column. */
  qualifications: AxisQualification[];
}

/** Fine-grained constraints controlling axes matching and qualification behavior */
export interface DiscoverColumnsConstraints {
  /** Allow source (query) axes that have no match in the hit column */
  allowFloatingSourceAxes: boolean;
  /** Allow hit column axes that have no match in the source (query) */
  allowFloatingHitAxes: boolean;
  /** Allow source (query) axes to be qualified (contextDomain extended) */
  allowSourceQualifications: boolean;
  /** Allow hit column axes to be qualified (contextDomain extended) */
  allowHitQualifications: boolean;
}

/** Request for discovering columns compatible with a given axes integration */
export interface DiscoverColumnsRequest {
  /** Include columns matching these selectors (OR-ed); empty or omitted matches all columns */
  includeColumns?: MultiColumnSelector[];
  /** Exclude columns matching these selectors (OR-ed); applied after include filter */
  excludeColumns?: MultiColumnSelector[];
  /** Already integrated axes with qualifications */
  axes: ColumnAxesWithQualifications[];
  /** Maximum number of hops allowed between provided axes integration and returned hits (0 = direct only) */
  maxHops?: number;
  /** Constraints controlling axes matching and qualification behavior */
  constraints: DiscoverColumnsConstraints;
}

/** Linker step: traversal through a linker column */
export interface DiscoverColumnsLinkerStep {
  type: "linker";
  /** The linker column traversed in this step */
  linker: PColumnIdAndSpec;
  /** Axis qualifications produced when matching the linker's many-side axes */
  qualifications: AxisQualification[];
}

/**
 * Filter step: intersects the current subquery with a filter column on shared
 * axes. Filter columns carry `pl7.app/isSubset: "true"` with axes ⊆ dataset
 * axes, so the inner-join narrows the key space to rows where the filter is
 * present.
 */
export interface DiscoverColumnsFilterStep {
  type: "filter";
  /** The filter column applied in this step */
  filter: PColumnIdAndSpec;
}

/** A step traversed during path-based column discovery. Discriminated by `type`. */
export type DiscoverColumnsStepInfo = DiscoverColumnsLinkerStep | DiscoverColumnsFilterStep;

/**
 * Input to `buildQuery`: a terminal column plus an ordered
 * path of wrapping steps (linker hops, filter joins). Produces a
 * {@link SpecQueryJoinEntry} ready to be plugged into an
 * `innerJoin`/`fullJoin`/`outerJoin` entry list.
 *
 * Path ordering: `path[0]` is outermost (first applied), `path[N-1]` is
 * closest to `column`. Omit or pass `[]` for a direct column with no
 * wrapping.
 *
 * Columns are referenced by id — specs are resolved later at
 * `evaluateQuery` against the registered specs of the PFrame, so the
 * caller cannot disagree with the frame about spec content.
 *
 * Qualifications annotate the resulting outermost entry; they do not
 * propagate into the inner query.
 */
export type BuildQueryInput = {
  /** Shape version marker — bumped only on breaking structural changes. */
  readonly version: "v1";
  /** Terminal column id — the column actually returning data. */
  readonly column: PObjectId;
  /** Ordered path from source integration to `column`. Outermost first. */
  readonly path?: DiscoverColumnsStepInfo[];
  /** Axis qualifications attached to the resulting join entry. */
  readonly qualifications?: AxisQualification[];
};

/** Qualifications info for a discover columns response mapping variant */
export interface DiscoverColumnsResponseQualifications {
  /** Qualifications for each query (already-integrated) column set */
  forQueries: AxisQualification[][];
  /** Qualifications for the hit column */
  forHit: AxisQualification[];
}

/** A single mapping variant describing how a hit column can be integrated */
export interface DiscoverColumnsMappingVariant {
  /** Full qualifications needed for integration */
  qualifications: DiscoverColumnsResponseQualifications;
  /** Distinctive (minimal) qualifications needed for integration */
  distinctiveQualifications: DiscoverColumnsResponseQualifications;
}

/** A single hit in the discover columns response */
export interface DiscoverColumnsResponseHit {
  /** The column that was found compatible */
  hit: PColumnIdAndSpec;
  /** Possible ways to integrate this column with the existing set */
  mappingVariants: DiscoverColumnsMappingVariant[];
  /** Linker steps traversed to reach this hit; empty for direct matches */
  path: DiscoverColumnsStepInfo[];
}

/** Response from discover columns */
export interface DiscoverColumnsResponse {
  /** Columns that could be integrated and possible ways to integrate them */
  hits: DiscoverColumnsResponseHit[];
}

/** Request for deleting an entry from a given axes integration */
export interface DeleteColumnRequest {
  /** Already integrated axes with qualifications */
  axes: ColumnAxesWithQualifications[];
  /** Zero based index of the entry to be deleted */
  delete: number;
}

/** Response from delete column */
export interface DeleteColumnResponse {
  axes: ColumnAxesWithQualifications[];
}

/** Response from evaluating a query against a PFrame. */
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

/** Handle to a spec-only PFrame (no data, synchronous operations). */
export type SpecFrameHandle = Branded<string, "SpecFrameHandle">;

/**
 * Synchronous driver for spec-level PFrame operations.
 *
 * Unlike the async PFrameDriver (which works with data), this driver
 * operates on column specifications only. All methods are synchronous
 * because the underlying WASM PFrame computes results immediately.
 */
export interface PFrameSpecDriver {
  /** Create a spec-only PFrame from column specs. Returns a pool entry with handle and unref. */
  createSpecFrame(specs: Record<string, PColumnSpec>): PoolEntry<SpecFrameHandle>;

  /** Discover columns compatible with given axes integration. */
  discoverColumns(
    handle: SpecFrameHandle,
    request: DiscoverColumnsRequest,
  ): DiscoverColumnsResponse;

  /** Delete an entry from a given axes integration */
  deleteColumn(handle: SpecFrameHandle, request: DeleteColumnRequest): DeleteColumnResponse;

  /** Evaluates a query specification against this PFrame */
  evaluateQuery(handle: SpecFrameHandle, request: SpecQuery): EvaluateQueryResponse;

  /** Expand index-based parentAxes in AxesSpec to resolved AxisId parents in AxesId. */
  expandAxes(spec: AxesSpec): AxesId;

  /** Collapse resolved AxisId parents back to index-based parentAxes in AxesSpec. */
  collapseAxes(ids: AxesId): AxesSpec;

  /** Find the index of an axis matching the given selector. Returns -1 if not found. */
  findAxis(spec: AxesSpec, selector: SingleAxisSelector): number;

  /** Find the flat index of a table column matching the given selector. Returns -1 if not found. */
  findTableColumn(tableSpec: PTableColumnSpec[], selector: PTableColumnId): number;
}
