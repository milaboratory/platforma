import canonicalize from 'canonicalize';
import type { AxisId, PColumnSpec, ValueType } from './spec';
import { getAxisId, matchAxisId } from './spec';

/** Reference types for axes within an anchored context. */

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
export interface APColumnMatcher {
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
export interface PColumnMatcher extends APColumnMatcher {
  domainAnchor?: never;
  domain?: Record<string, string>;
  axes?: AxisId[];
}

/**
 * Strict identifier for PColumns in an anchored context
 * Unlike APColumnMatcher, this requires exact matches on domain and axes
 */
export interface APColumnId extends APColumnMatcher {
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
   * Domain packs are used to group domain keys that can be anchored to the same anchor
   * This is used to optimize the lookup of domain anchors
   */
  private readonly domainPacks: string[][] = [];
  /**
   * Maps domain packs to anchors
   */
  private readonly domainPackToAnchor = new Map<string, string>();

  /**
   * Creates a new anchor context from a set of anchor column specifications
   * @param anchors Record of anchor column specifications indexed by anchor ID
   */
  constructor(private readonly anchors: Record<string, PColumnSpec>) {
    const anchorEntries = Object.entries(anchors);
    anchorEntries.sort((a, b) => a[0].localeCompare(b[0]));
    for (const [anchorId, spec] of anchorEntries) {
      for (let axisIdx = 0; axisIdx < spec.axesSpec.length; axisIdx++) {
        const axis = spec.axesSpec[axisIdx];
        const key = axisKey(axis);
        this.axes.set(key, { anchor: anchorId, idx: axisIdx });
      }
      if (spec.domain !== undefined) {
        const domainEntries = Object.entries(spec.domain);
        domainEntries.sort((a, b) => a[0].localeCompare(b[0]));

        this.domainPackToAnchor.set(JSON.stringify(domainEntries), anchorId);
        this.domainPacks.push(domainEntries.map(([dKey]) => dKey));

        for (const [dKey, dValue] of domainEntries) {
          const key = domainKey(dKey, dValue);
          this.domains.set(key, anchorId);
        }
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
    const result: APColumnId = {
      name: spec.name,
      axes: [],
    };

    let skipDomains: Set<string> | undefined = undefined;
    if (spec.domain !== undefined) {
      outer:
      for (const domainPack of this.domainPacks) {
        const dAnchor: string[][] = [];
        for (const domainKey of domainPack) {
          const dValue = spec.domain[domainKey];
          if (dValue !== undefined)
            dAnchor.push([domainKey, dValue]);
          else
            break outer;
        }
        const domainAnchor = this.domainPackToAnchor.get(JSON.stringify(dAnchor));
        if (domainAnchor !== undefined) {
          result.domainAnchor = domainAnchor;
          skipDomains = new Set(domainPack);
          break;
        }
      }
    }

    for (const [dKey, dValue] of Object.entries(spec.domain ?? {})) {
      if (skipDomains !== undefined && skipDomains.has(dKey))
        continue;
      const key = domainKey(dKey, dValue);
      const anchorId = this.domains.get(key);
      result.domain ??= {};
      result.domain[dKey] = anchorId ? { anchor: anchorId } : dValue;
    }

    result.axes = spec.axesSpec.map((axis) => {
      const key = axisKey(axis);
      const anchorAxisRef = this.axes.get(key);
      return anchorAxisRef ?? axis;
    });

    return result;
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

/**
 * Resolves anchored references in a column matcher to create a non-anchored matcher
 *
 * @param anchors - Record of anchor column specifications indexed by anchor ID
 * @param matcher - An anchored column matcher containing references that need to be resolved
 * @returns A non-anchored column matcher with all references resolved to actual values
 */
function resolveAnchors(anchors: Record<string, PColumnSpec>, matcher: APColumnMatcher): PColumnMatcher {
  const result = { ...matcher };

  if (result.domainAnchor !== undefined) {
    const anchorSpec = anchors[result.domainAnchor];
    if (!anchorSpec)
      throw new Error(`Anchor "${result.domainAnchor}" not found`);

    const anchorDomains = anchorSpec.domain || {};
    result.domain = { ...anchorDomains, ...result.domain };
    delete result.domainAnchor;
  }

  if (result.domain) {
    const resolvedDomain: Record<string, string> = {};
    for (const [key, value] of Object.entries(result.domain)) {
      if (typeof value === 'string') {
        resolvedDomain[key] = value;
      } else {
        // It's an AnchorDomainRef
        const anchorSpec = anchors[value.anchor];
        if (!anchorSpec)
          throw new Error(`Anchor "${value.anchor}" not found for domain key "${key}"`);

        if (!anchorSpec.domain || anchorSpec.domain[key] === undefined)
          throw new Error(`Domain key "${key}" not found in anchor "${value.anchor}"`);

        resolvedDomain[key] = anchorSpec.domain[key];
      }
    }
    result.domain = resolvedDomain;
  }

  if (result.axes)
    result.axes = result.axes.map((axis) => resolveAxisReference(anchors, axis));

  return result as PColumnMatcher;
}

/**
 * Resolves an anchored axis reference to a concrete AxisId
 */
function resolveAxisReference(anchors: Record<string, PColumnSpec>, axisRef: AAxisId): AxisId {
  if (!isAnchorAxisRef(axisRef))
    return axisRef;

  // It's an anchored reference
  const anchorId = axisRef.anchor;
  const anchorSpec = anchors[anchorId];
  if (!anchorSpec)
    throw new Error(`Anchor "${anchorId}" not found for axis reference`);

  if ('idx' in axisRef) {
    // AnchorAxisRefByIdx
    if (axisRef.idx < 0 || axisRef.idx >= anchorSpec.axesSpec.length)
      throw new Error(`Axis index ${axisRef.idx} out of bounds for anchor "${anchorId}"`);
    return anchorSpec.axesSpec[axisRef.idx];
  } else if ('name' in axisRef) {
    // AnchorAxisRefByName
    const matches = anchorSpec.axesSpec.filter((axis) => axis.name === axisRef.name);
    if (matches.length > 1)
      throw new Error(`Multiple axes with name "${axisRef.name}" found in anchor "${anchorId}"`);
    if (matches.length === 0)
      throw new Error(`Axis with name "${axisRef.name}" not found in anchor "${anchorId}"`);
    return matches[0];
  } else if ('id' in axisRef) {
    // AnchorAxisRefByMatcher
    const matches = anchorSpec.axesSpec.filter((axis) => matchAxisId(axisRef.id, getAxisId(axis)));
    if (matches.length > 1)
      throw new Error(`Multiple matching axes found for matcher in anchor "${anchorId}"`);
    if (matches.length === 0)
      throw new Error(`No matching axis found for matcher in anchor "${anchorId}"`);
    return matches[0];
  }

  throw new Error(`Unsupported axis reference type`);
}

/**
 * Type guard to check if a value is an anchored axis reference
 */
function isAnchorAxisRef(value: AAxisId): value is AnchorAxisRef {
  return typeof value === 'object' && 'anchor' in value;
}
