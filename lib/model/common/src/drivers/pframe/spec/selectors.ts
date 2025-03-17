import type { AxisId, ValueType } from './spec';

/**
 * Reference to an axis by its numerical index within the anchor column's axes array
 * Format: [anchorId, axisIndex]
 */
export type AnchorAxisRefByIdx = { anchor: string; idx: number };

/**
 * Reference to an axis by its name within the anchor column
 * Format: [anchorId, axisName]
 */
export type AnchorAxisRefByName = { anchor: string; name: string };

/**
 * Reference to an axis using an AxisId matcher within the anchor
 * Format: [anchorId, axisMatcher]
 */
export type AnchorAxisRefByMatcher = { anchor: string; id: AxisId };

/**
 * Basic anchor axis reference that can be either by index or a direct AxisId
 */
export type AnchorAxisIdOrRefBasic = AnchorAxisRefByIdx | AxisId;

/**
 * Union of all possible ways to reference an axis in an anchored context
 */
export type AnchorAxisIdOrRef = AnchorAxisIdOrRefBasic | AnchorAxisRefByName | AnchorAxisRefByMatcher;

/** Union of all possible ways to reference an axis in an anchored context  */
export type AnchorAxisRef = AnchorAxisRefByIdx | AnchorAxisRefByName | AnchorAxisRefByMatcher;

/** Reference to a domain value through an anchor */
export type AnchorDomainRef = { anchor: string };

/**
 * Domain value that can be either a direct string value or a reference to a domain through an anchor
 * Used to establish domain context that can be resolved relative to other anchored columns
 */
export type ADomain = string | AnchorDomainRef;
/**
 * Axis identifier that can be either a direct AxisId or a reference to an axis through an anchor
 * Allows referring to axes in a way that can be resolved in different contexts
 */
export type AAxisId = AxisId | AnchorAxisIdOrRef;

/**
 * Match resolution strategy for PColumns
 * Specifies how to handle when multiple columns match the criteria
 * (default is "expectSingle")
 */
export type AnchoredColumnMatchStrategy = 'expectSingle' | 'expectMultiple' | 'takeFirst';

/**
 * Matcher for PColumns in an anchored context
 * Supports partial matching on axes, allowing for flexible column discovery
 */
export interface APColumnSelector {
  /** Optional name of the column to match; can't be used together with namePattern */
  name?: string;
  /** Optional regexp pattern for column name matching; can't be used together with name */
  namePattern?: string;
  /** Optional value type to match. If an array is provided, matches if the column's type is any of the specified types */
  type?: ValueType | ValueType[];
  /** If specified, the domain values must be anchored to this anchor */
  domainAnchor?: string;
  /** Optional domain values to match, can include anchored references, if domainAnchor is specified,
   * interpreted as additional domains to domain from the anchor */
  domain?: Record<string, ADomain>;
  /** Optional axes to match, can include anchored references */
  axes?: AAxisId[];
  /** When true, allows matching if only a subset of axes match */
  partialAxesMatch?: boolean;
  /** Optional annotations to match with exact values */
  annotations?: Record<string, string>;
  /** Optional annotation patterns to match with regex patterns */
  annotationPatterns?: Record<string, string>;
  /** Match resolution strategy, default is "expectSingle" */
  matchStrategy?: AnchoredColumnMatchStrategy;
}

/**
 * Matcher for PColumns in a non-anchored context
 */
export interface PColumnSelector extends APColumnSelector {
  domainAnchor?: never;
  domain?: Record<string, string>;
  axes?: AxisId[];
}

/**
 * Strict identifier for PColumns in an anchored context
 * Unlike APColumnMatcher, this requires exact matches on domain and axes
 */
export interface APColumnId extends APColumnSelector {
  /** Name is required for exact column identification */
  name: string;
  /** No namePattern in ID */
  namePattern?: never;
  /** Type is not used in exact column identification */
  type?: never;
  /** Full axes specification using only basic references */
  axes: AnchorAxisIdOrRefBasic[];
  /** Partial axes matching is not allowed for exact identification */
  partialAxesMatch?: never;
  /** Annotations are not used in exact column identification */
  annotations?: never;
  /** Annotation patterns are not used in exact column identification */
  annotationPatterns?: never;
  /** "Id" implies single match strategy */
  matchStrategy?: never;
}
