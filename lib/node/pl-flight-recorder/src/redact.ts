import crypto from "node:crypto";
import { summarizeData, type DataSummary } from "./data_summary";

/**
 * Structure-preserving redaction for anything a driver seam is handed.
 *
 * The definition a block model builds is recorded by *shape* rather than by a
 * hand-written digest per definition type. Keys, numbers and the small set of
 * strings that are schema survive verbatim; every other string is replaced by a
 * hash and a length. That keeps the record useful for diagnosis, keeps customer
 * data out of it by default rather than by enumeration, and works unchanged for
 * definition shapes this code has never seen — the V2 query API included.
 *
 * The default for an unrecognised string is to hash it. A new field can
 * therefore make a report less informative, but never make it leak.
 */

/** Keys whose string value is schema, kept as written. */
export const SCHEMA_KEYS = new Set(["type", "name", "valueType", "kind", "operator", "mode"]);

/** Keys under which every string is schema, at any depth (axis identity). */
export const SCHEMA_SUBTREE_KEYS = new Set(["domain", "contextDomain"]);

/** Keys never descended into; summarised by counts instead. */
export const SUMMARISED_KEYS = new Set(["data", "dataInfo"]);

/** Keys reduced to a cardinality, because their contents are values. */
export const COUNTED_KEYS = new Set(["references", "parts"]);

export type RedactionStats = {
  hashedStrings: number;
  truncatedArrays: number;
  omittedItems: number;
  depthCapped: number;
  opaqueObjects: number;
  budgetExhausted: boolean;
};

export type RedactOptions = {
  maxDepth?: number;
  maxArrayItems?: number;
  maxStringLength?: number;
  /** Ceiling on emitted values, so one pathological definition cannot fill the log. */
  maxNodes?: number;
};

export type HashedString = { h: string; n: number };

/** Redacts a definition, returning the new value and what had to be elided. */
export function redact(
  value: unknown,
  options: RedactOptions = {},
): { value: unknown; stats: RedactionStats } {
  const limits = {
    maxDepth: options.maxDepth ?? 32,
    maxArrayItems: options.maxArrayItems ?? 64,
    maxStringLength: options.maxStringLength ?? 128,
    maxNodes: options.maxNodes ?? 20_000,
  };
  const stats: RedactionStats = {
    hashedStrings: 0,
    truncatedArrays: 0,
    omittedItems: 0,
    depthCapped: 0,
    opaqueObjects: 0,
    budgetExhausted: false,
  };
  const state = { nodes: 0, seen: new WeakSet<object>() };
  return {
    value: walk(value, { key: undefined, schemaSubtree: false, depth: 0 }, limits, stats, state),
    stats,
  };
}

/** Stable short hash plus the original length. Never reversible to the value. */
export function hashString(value: string): HashedString {
  return {
    h: crypto.createHash("sha256").update(value).digest("hex").slice(0, 12),
    n: value.length,
  };
}

/** True for the object form produced in place of a redacted string. */
export function isHashedString(value: unknown): value is HashedString {
  return typeof value === "object" && value !== null && "h" in value && "n" in value;
}

// Internals

type Position = { key: string | undefined; schemaSubtree: boolean; depth: number };
type Limits = Required<RedactOptions>;
type State = { nodes: number; seen: WeakSet<object> };

function walk(
  value: unknown,
  at: Position,
  limits: Limits,
  stats: RedactionStats,
  state: State,
): unknown {
  if (state.nodes++ > limits.maxNodes) {
    stats.budgetExhausted = true;
    return { $budget: true };
  }

  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactString(value, at, limits, stats);
  if (typeof value !== "object") return { $type: typeof value };

  if (at.depth >= limits.maxDepth) {
    stats.depthCapped++;
    return { $depth: at.depth };
  }
  // A definition can carry live accessors and other class instances whose
  // internals reference each other; walking those is neither safe nor useful.
  if (state.seen.has(value)) return { $cycle: true };

  if (Array.isArray(value)) {
    state.seen.add(value);
    return walkArray(value, at, limits, stats, state);
  }
  if (!isPlainObject(value)) {
    stats.opaqueObjects++;
    return { $opaque: className(value) };
  }

  state.seen.add(value);
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SUMMARISED_KEYS.has(key)) {
      out[key] = summarizeData(child);
      continue;
    }
    if (COUNTED_KEYS.has(key)) {
      out[key] = { $count: countOf(child) };
      continue;
    }
    out[key] = walk(
      child,
      {
        key,
        schemaSubtree: at.schemaSubtree || SCHEMA_SUBTREE_KEYS.has(key),
        depth: at.depth + 1,
      },
      limits,
      stats,
      state,
    );
  }
  return out;
}

function walkArray(
  value: unknown[],
  at: Position,
  limits: Limits,
  stats: RedactionStats,
  state: State,
): unknown[] {
  const kept = value
    .slice(0, limits.maxArrayItems)
    .map((item) =>
      walk(
        item,
        { key: at.key, schemaSubtree: at.schemaSubtree, depth: at.depth + 1 },
        limits,
        stats,
        state,
      ),
    );
  const omitted = value.length - kept.length;
  if (omitted <= 0) return kept;
  // Arrays stay arrays so the rules can still walk join entries; the loss is
  // recorded in the array itself rather than in a side channel.
  stats.truncatedArrays++;
  stats.omittedItems += omitted;
  return [...kept, { $omitted: omitted }];
}

function redactString(
  value: string,
  at: Position,
  limits: Limits,
  stats: RedactionStats,
): string | HashedString {
  if (at.schemaSubtree || (at.key !== undefined && SCHEMA_KEYS.has(at.key))) {
    return value.length > limits.maxStringLength
      ? `${value.slice(0, limits.maxStringLength)}…`
      : value;
  }
  stats.hashedStrings++;
  return hashString(value);
}

function countOf(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.length;
  if (isPlainObject(value)) return Object.keys(value).length;
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

function className(value: object): string {
  return (value as { constructor?: { name?: string } }).constructor?.name ?? "unknown";
}

export type { DataSummary };
