import type { Optional } from "utility-types";
import type { BasicResourceData, ResourceData } from "./types";
import { isNotNullSignedResourceId, isNullSignedResourceId } from "./types";

/**
 * Tells whether a resource state is final for a consumer: whether it will not change in any way
 * that consumer observes, under the write exceptions the predicate documents. If the data carries
 * no fields (`fields` undefined), the answer is about the basic part of the resource data only.
 */
export type FinalResourceDataPredicate = (
  resourceData: Optional<ResourceData, "fields">,
) => boolean;

/** Ready for calculation, a duplicate of an original, or carrying a resource error. */
export function readyOrDuplicateOrError(r: ResourceData | BasicResourceData): boolean {
  return (
    r.resourceReady ||
    isNotNullSignedResourceId(r.originalResourceId) ||
    isNotNullSignedResourceId(r.error)
  );
}

/** {@link readyOrDuplicateOrError}, outputs locked, and every supplied field holding a final
 * non-null value or an error. Without fields the answer is about the basic part only. */
export function readyAndAllOutputsFilled(r: Optional<ResourceData, "fields">): boolean {
  if (!readyOrDuplicateOrError(r)) return false;
  if (!r.outputsLocked) return false;
  if (r.fields === undefined) return true;
  for (const f of r.fields)
    if (isNullSignedResourceId(f.error) && (isNullSignedResourceId(f.value) || !f.valueIsFinal))
      return false;
  return true;
}

/** A condition with a traversal stop-rule translation. */
export type TranslatableFinalityRule =
  | "always"
  | "readyOrDuplicateOrError"
  | "readyAndAllOutputsFilled";

/** When a resource of a type counts as final. */
export type FinalityRule =
  | TranslatableFinalityRule
  | "never"
  | { readonly custom: FinalResourceDataPredicate };

/**
 * How an entry is expressed as a traversal stop rule: `"exact"` translates its rule;
 * `approx` stops on the given condition, which differs from the rule for the stated reason;
 * `none` contributes no clause for this entry.
 */
export type FinalityStopRule =
  | "exact"
  | { readonly approx: TranslatableFinalityRule; readonly reason: string }
  | { readonly none: string };

/** The resource types an entry covers: one type name, or every name with a prefix. */
export type FinalityMatch = { readonly name: string } | { readonly prefix: string };

type EntryBase = {
  readonly match: FinalityMatch;
  /** What the backend writes after the rule holds, and why that is safe for this layer. */
  readonly why: string;
  /** The field pruning the entry relies on in trees that prune; the project tree must apply it. */
  readonly requiresPruning?: { readonly type: string; readonly fields: "all" | readonly string[] };
};

/** One row of a finality table: the types it matches, when they count as final, why, and how the
 * rule becomes a stop rule. A custom rule must declare a non-exact stop rule. */
export type FinalityEntry = EntryBase &
  (
    | {
        readonly rule: TranslatableFinalityRule | "never";
        readonly stopRule?: Exclude<FinalityStopRule, "exact"> | "exact";
      }
    | {
        readonly rule: { readonly custom: FinalResourceDataPredicate };
        readonly stopRule: Exclude<FinalityStopRule, "exact">;
      }
  );

function matches(match: FinalityMatch, typeName: string): boolean {
  return "name" in match ? typeName === match.name : typeName.startsWith(match.prefix);
}

function matchKey(match: FinalityMatch): string {
  return "name" in match ? `name:${match.name}` : `prefix:${match.prefix}`;
}

function holds(rule: FinalityRule, r: Optional<ResourceData, "fields">): boolean {
  switch (rule) {
    case "always":
      return true;
    case "never":
      return false;
    case "readyOrDuplicateOrError":
      return readyOrDuplicateOrError(r);
    case "readyAndAllOutputsFilled":
      return readyAndAllOutputsFilled(r);
    default:
      return rule.custom(r);
  }
}

// Unknown type names are logged once, across every table and predicate.
const unknownResourceTypeNames = new Set<string>();

/**
 * A layer of the finality table. Each layer is its parent plus its own entries: a resource is
 * final in a layer if it is final in the parent or by an entry of the layer, so a layer never
 * calls final less than its parent does. A type no entry of any layer covers is never final.
 */
export class FinalityTable {
  /** The entries of this layer and its ancestors, the base first. */
  public readonly entries: readonly FinalityEntry[];

  private constructor(
    /** Names the layer in messages and tests. */
    public readonly name: string,
    own: readonly FinalityEntry[],
    parent: FinalityTable | undefined,
  ) {
    const seen = new Set<string>();
    for (const e of own) {
      const key = matchKey(e.match);
      if (seen.has(key)) throw new Error(`finality table ${name}: ${key} is listed twice`);
      seen.add(key);
    }
    this.entries = parent === undefined ? own : [...parent.entries, ...own];
  }

  /** A base layer. Throws if `entries` lists a match twice. */
  static of(name: string, entries: readonly FinalityEntry[]): FinalityTable {
    return new FinalityTable(name, entries, undefined);
  }

  /** A child layer: this one plus `additions`. Throws if `additions` lists a match twice. */
  extend(name: string, additions: readonly FinalityEntry[]): FinalityTable {
    return new FinalityTable(name, additions, this);
  }

  /** True when any entry of the layer or its ancestors matching `r`'s type holds for `r`. A type
   * no entry matches is false, and its name is logged once. */
  isFinal(r: Optional<ResourceData, "fields">): boolean {
    let covered = false;
    for (const e of this.entries) {
      if (!matches(e.match, r.type.name)) continue;
      covered = true;
      if (holds(e.rule, r)) return true;
    }
    if (!covered && !unknownResourceTypeNames.has(r.type.name)) {
      unknownResourceTypeNames.add(r.type.name);
      console.log("UNKNOWN RESOURCE TYPE: " + r.type.name);
    }
    return false;
  }

  /** {@link isFinal} as a standalone function. */
  predicate(): FinalResourceDataPredicate {
    return (r) => this.isFinal(r);
  }
}
