import type { PColumnIdAndSpec } from "@milaboratories/pl-model-common";
import type { AxisQualification, ColumnAxesWithQualifications } from "./common";

/** Matches a string value either exactly or by regex pattern */
export type StringMatcher = { type: "exact"; value: string } | { type: "regex"; value: string };

/** Map of key to array of string matchers (OR-ed per key, AND-ed across keys) */
export type MatcherMap = Record<string, StringMatcher[]>;

/** Selector for matching axes by various criteria */
export interface MultiAxisSelector {
  /** Match any of the axis types listed here */
  readonly type?: string[];
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
  readonly type?: string[];
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
  /** Column filters (OR-ed); empty array matches all columns */
  columnFilter?: MultiColumnSelector[];
  /** Already integrated axes with qualifications */
  axes: ColumnAxesWithQualifications[];
  /** Constraints controlling axes matching and qualification behavior */
  constraints: DiscoverColumnsConstraints;
}

/** V2 request with separate include/exclude filters */
export interface DiscoverColumnsRequestV2 {
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

/** A step traversed during path-based column discovery. Discriminated by `type`. */
export type DiscoverColumnsStepInfo = DiscoverColumnsLinkerStep;

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
  path?: DiscoverColumnsStepInfo[];
}

/** Response from discover columns */
export interface DiscoverColumnsResponse {
  /** Columns that could be integrated and possible ways to integrate them */
  hits: DiscoverColumnsResponseHit[];
}
