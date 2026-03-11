import type { PColumnIdAndSpec } from "@milaboratories/pl-model-common";
import type { AxisQualification, ColumnAxesWithQualifications } from "./common";

/** Matches a string value either exactly or by regex pattern */
export type StringMatcher = { exact: string } | { regex: string };

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
}

/** Response from discover columns */
export interface DiscoverColumnsResponse {
  /** Columns that could be integrated and possible ways to integrate them */
  hits: DiscoverColumnsResponseHit[];
}
