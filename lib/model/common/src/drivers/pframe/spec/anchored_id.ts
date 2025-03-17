import canonicalize from 'canonicalize';
import type { AxisId, PColumnSpec } from './spec';
import { getAxisId, matchAxisId } from './spec';
import type { AAxisId, AnchorAxisRef, AnchorAxisRefByIdx, APColumnId, APColumnSelector, PColumnSelector } from './selectors';

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
export function resolveAnchors(anchors: Record<string, PColumnSpec>, matcher: APColumnSelector): PColumnSelector {
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

  return result as PColumnSelector;
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
