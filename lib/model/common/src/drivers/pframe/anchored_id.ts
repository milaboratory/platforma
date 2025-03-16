import canonicalize from 'canonicalize';
import { AxisId, getAxisId, PColumnSpec, ValueType } from './spec';

/** Reference types for axes within an anchored context. */

/** 
 * Reference to an axis by its numerical index within the anchor column's axes array
 * Format: [anchorId, axisIndex]
 */
export type AnchorAxisRefByIdx = [string, number];

/**
 * Reference to an axis by its name within the anchor column
 * Format: [anchorId, axisName]
 */
export type AnchorAxisRefByName = [string, string];

/**
 * Reference to an axis using an AxisId matcher within the anchor
 * Format: [anchorId, axisMatcher]
 */
export type AnchorAxisRefByMatcher = [string, AxisId];

/** 
 * Basic anchor axis reference that can be either by index or a direct AxisId
 */
export type AnchorAxisRefBasic = AnchorAxisRefByIdx | AxisId;

/** 
 * Union of all possible ways to reference an axis in an anchored context
 */
export type AnchorAxisRef = AnchorAxisRefBasic | AnchorAxisRefByName | AnchorAxisRefByMatcher;

/** Reference to a domain value through an anchor */
export type AnchorDomainRef = { anc: string };

/** 
 * Domain value that can be either a direct string value or a reference to a domain through an anchor
 * Used to establish domain context that can be resolved relative to other anchored columns
 */
export type ADomain = string | AnchorDomainRef;
/**
 * Axis identifier that can be either a direct AxisId or a reference to an axis through an anchor
 * Allows referring to axes in a way that can be resolved in different contexts
 */
export type AAxisId = AxisId | AnchorAxisRef;

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
export interface APColumnMatcher {
  /** Name of the column to match */
  name: string;
  /** Optional value type to match */
  type?: ValueType;
  /** Optional domain values to match, can include anchored references */
  domain?: Record<string, ADomain>;
  /** Optional axes to match, can include anchored references */
  axes?: AAxisId[];
  /** When true, allows matching if only a subset of axes match */
  partialAxesMatch?: boolean;
  /** Match resolution strategy, default is "expectSingle" */
  matchStrategy?: AnchoredColumnMatchStrategy;
};

/**
 * Strict identifier for PColumns in an anchored context
 * Unlike APColumnMatcher, this requires exact matches on domain and axes
 */
export interface APColumnId extends APColumnMatcher {
  /** Type is not used in exact column identification */
  type?: never;
  /** Full domain specification with no partial matching */
  domain: Record<string, ADomain>;
  /** Full axes specification using only basic references */
  axes: AnchorAxisRefBasic[];
  /** Partial axes matching is not allowed for exact identification */
  partialAxesMatch?: never;
  /** "Id" implies single match strategy */
  matchStrategy?: never;
}

//
// Helper functions
//

function axisKey(axis: AxisId): string {
  return canonicalize(getAxisId(axis))!;
}

function domainKey(key: string, value: string): string {
  return JSON.stringify([key, value]);
}

/**
 * Context for resolving and generating anchored references to columns and axes
 * Maintains maps of known domain values and axes that can be referenced by anchors
 */
export class AnchorCtx {
  private readonly domains = new Map<string, string>();
  private readonly axes = new Map<string, AnchorAxisRefByIdx>();

  /**
   * Creates a new anchor context from a set of anchor column specifications
   * @param anchors Record of anchor column specifications indexed by anchor ID
   */
  constructor(anchors: Record<string, PColumnSpec>) {
    for (const [anchorId, spec] of Object.entries(anchors)) {
      for (let axisIdx = 0; axisIdx < spec.axesSpec.length; axisIdx++) {
        const axis = spec.axesSpec[axisIdx];
        const key = axisKey(axis);
        this.axes.set(key, [anchorId, axisIdx]);
      }
      for (const [dKey, dValue] of Object.entries(spec.domain ?? {})) {
        const key = domainKey(dKey, dValue);
        this.domains.set(key, anchorId);
      }
    }
  }

  /**
   * Derives an anchored column identifier from a column specification
   * Replaces domain values and axes with anchored references when possible
   * @param spec Column specification to anchor
   * @returns An anchored column identifier that can be used to identify columns similar to the input specification
   */
  deriveAId(spec: PColumnSpec): APColumnId {
    const domain: Record<string, ADomain> = {};
    for (const [dKey, dValue] of Object.entries(spec.domain ?? {})) {
      const key = domainKey(dKey, dValue);
      const anchorId = this.domains.get(key);
      domain[dKey] = anchorId ? { anc: anchorId } : dValue;
    }

    const axes: AnchorAxisRefBasic[] = spec.axesSpec.map((axis) => {
      const key = axisKey(axis);
      const anchorAxisRef = this.axes.get(key);
      return anchorAxisRef || axis;
    });

    return {
      name: spec.name,
      domain,
      axes,
    };
  }

  /**
   * Derives a canonicalized string representation of an anchored column identifier, can be used as a unique identifier for the column
   * @param spec Column specification to anchor
   * @returns A canonicalized string representation of the anchored column identifier
   */
  deriveAIdString(spec: PColumnSpec): string {
    const aId = this.deriveAId(spec);
    return canonicalize(aId)!;
  }
}