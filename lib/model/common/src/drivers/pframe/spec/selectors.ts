import { isPColumnSpec, type PObjectSpec } from '../../../pool';
import type { AxisId, PColumnSpec, ValueType } from './spec';
import { getAxisId } from './spec';

/**
 * Defines a pattern for matching axes within the PFrame data model.
 *
 * AxisSelector provides a flexible way to identify axes based on their
 * properties. All fields are optional, allowing for partial matching.
 * When multiple properties are specified, all must match for an axis
 * to be selected (logical AND).
 *
 * This interface is used in various selection and matching operations
 * throughout the PFrame system, such as column queries and axis lookups.
 */
export interface AxisSelector {
  /**
   * Optional value type to match against.
   * When specified, only axes with this exact type will match.
   * Can be a single type or an array of types to match against any of them.
   * Valid types include: 'Int', 'Long', 'Float', 'Double', 'String', 'Bytes'.
   */
  type?: ValueType | ValueType[];

  /**
   * Optional name to match against.
   * When specified, only axes with this exact name will match.
   */
  name?: string;

  /**
   * Optional domain key-value pairs to match against.
   * Domains provide additional context to uniquely identify an axis beyond its name and type.
   * When specified, an axis will match only if it contains all the key-value pairs defined here.
   * An axis with additional domain entries not present in this selector will still match.
   */
  domain?: Record<string, string>;
}

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
export type AAxisSelector = AxisSelector | AnchorAxisRef;

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
  axes?: AAxisSelector[];
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
  axes?: AxisSelector[];
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

/**
 * Determines if an axis ID matches an axis selector.
 *
 * @param selector - The selector with criteria to match against
 * @param axis - The AxisId to check against the selector
 * @returns true if the AxisId matches all specified criteria in the selector, false otherwise
 */
export function matchAxis(selector: AxisSelector, axis: AxisId): boolean {
  // Match name if specified
  if (selector.name !== undefined && selector.name !== axis.name)
    return false;

  // Match type if specified
  if (selector.type !== undefined) {
    if (Array.isArray(selector.type)) {
      if (!selector.type.includes(axis.type))
        return false;
    } else if (selector.type !== axis.type) {
      return false;
    }
  }

  // Match domain if specified - using existing logic from matchAxisId
  if (selector.domain !== undefined) {
    const axisDomain = axis.domain || {};
    for (const [key, value] of Object.entries(selector.domain))
      if (axisDomain[key] !== value)
        return false;
  }

  return true;
}

/**
 * Determines if a given PColumnSpec matches a selector.
 *
 * @param pcolumn - The PColumnSpec to check against the selector
 * @param selector - The selector criteria to match against
 * @returns true if the PColumnSpec matches all criteria in the selector, false otherwise
 */
export function matchPColumn(pcolumn: PColumnSpec, selector: PColumnSelector): boolean {
  // Match name if specified
  if (selector.name !== undefined && pcolumn.name !== selector.name)
    return false;

  // Match name pattern if specified
  if (selector.namePattern !== undefined && !new RegExp(selector.namePattern).test(pcolumn.name))
    return false;

  // Match type if specified
  if (selector.type !== undefined) {
    if (Array.isArray(selector.type)) {
      if (!selector.type.includes(pcolumn.valueType))
        return false;
    } else if (selector.type !== pcolumn.valueType) {
      return false;
    }
  }

  // Match domain if specified
  if (selector.domain !== undefined) {
    const columnDomain = pcolumn.domain || {};
    for (const [key, value] of Object.entries(selector.domain))
      if (columnDomain[key] !== value)
        return false;
  }

  // Match axes if specified
  if (selector.axes !== undefined) {
    const pcolumnAxes = pcolumn.axesSpec.map(getAxisId);

    if (selector.partialAxesMatch) {
      // For partial matching, all selector axes must match at least one column axis
      for (const selectorAxis of selector.axes)
        if (!pcolumnAxes.some((columnAxis) => matchAxis(selectorAxis, columnAxis)))
          return false;
    } else {
      // For exact matching, column must have the same number of axes and all must match
      if (pcolumnAxes.length !== selector.axes.length)
        return false;

      // Each selector axis must match a corresponding column axis
      for (let i = 0; i < selector.axes.length; i++)
        if (!matchAxis(selector.axes[i], pcolumnAxes[i]))
          return false;
    }
  }

  // Match annotations if specified
  if (selector.annotations !== undefined) {
    const columnAnnotations = pcolumn.annotations || {};
    for (const [key, value] of Object.entries(selector.annotations))
      if (columnAnnotations[key] !== value)
        return false;
  }

  // Match annotation patterns if specified
  if (selector.annotationPatterns !== undefined) {
    const columnAnnotations = pcolumn.annotations || {};
    for (const [key, pattern] of Object.entries(selector.annotationPatterns)) {
      const value = columnAnnotations[key];
      if (value === undefined || !new RegExp(pattern).test(value))
        return false;
    }
  }

  return true;
}

/**
 * Convert a predicate or array of selectors to a single predicate function
 * @param predicateOrSelectors - Either a function that takes a PColumnSpec and returns a boolean,
 *                              or an array of PColumnSelectors, or a single PColumnSelector
 * @returns A function that takes a PColumnSpec and returns a boolean
 */
export function selectorsToPredicate(predicateOrSelectors: PColumnSelector | PColumnSelector[]): ((spec: PObjectSpec) => boolean) {
  if (Array.isArray(predicateOrSelectors))
    return (spec) => predicateOrSelectors.some((selector) => isPColumnSpec(spec) && matchPColumn(spec, selector));
  else
    return (spec) => isPColumnSpec(spec) && matchPColumn(spec, predicateOrSelectors);
}
