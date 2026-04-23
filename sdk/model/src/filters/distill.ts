import { DistributiveKeys, isNil, UnionToTuples } from "@milaboratories/helpers";
import {
  RootFilterSpec,
  type FilterSpec,
  type FilterSpecLeaf,
} from "@milaboratories/pl-model-common";
import { traverseFilterSpec } from "./traverse";
import { InferFilterSpecLeaf } from "@milaboratories/pl-model-common";
import { isEmpty } from "es-toolkit/compat";

/**
 * Strips non-FilterSpec metadata (whitelist approach) and removes
 * unfilled leaves (type is undefined or any required field is undefined).
 */
export function distillFilterSpec<
  FS extends FilterSpec<FilterSpecLeaf<unknown>, unknown, unknown>,
  R extends FS extends RootFilterSpec<FilterSpecLeaf<unknown>, unknown, unknown>
    ? RootFilterSpec<InferFilterSpecLeaf<FS>>
    : FilterSpec<InferFilterSpecLeaf<FS>>,
>(filter: null | undefined | FS): null | R {
  if (filter == null) return null;
  return traverseFilterSpec<FS, null | R>(filter, {
    leaf: (leaf) => {
      const distilled = distillLeaf(leaf);
      return isFilledLeaf(distilled) ? (distilled as R) : null;
    },
    and: (results) => {
      const filtered = results.filter((f): f is NonNullable<typeof f> => f !== null);
      return filtered.length === 0 ? null : ({ type: "and", filters: filtered } as R);
    },
    or: (results) => {
      const filtered = results.filter((f): f is NonNullable<typeof f> => f !== null);
      return filtered.length === 0 ? null : ({ type: "or", filters: filtered } as R);
    },
    not: (result) => (result === null ? null : ({ type: "not", filter: result } as R)),
  });
}

function distillLeaf<T>(node: FilterSpecLeaf<T>): FilterSpecLeaf<T> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (KNOWN_LEAF_KEYS.has(key as FilterSpecLeafKey)) {
      result[key] = value;
    }
  }
  return result as FilterSpecLeaf<T>;
}

/** Returns true if the leaf is filled — type is defined and every required field per-type is filled. */
function isFilledLeaf<T>(node: FilterSpecLeaf<T>): boolean {
  if (isNil(node.type)) return false;
  const required = REQUIRED_KEYS_BY_TYPE[node.type];
  const record = node as Record<string, unknown>;
  return required.every((key) => isFilledValue(record[key]));
}

/**
 * Returns true if the value is considered "filled":
 * - primitives (number, boolean): always true
 * - string: non-empty after trim
 * - array: non-empty AND every item is filled
 * - plain object: non-empty AND every field value is filled
 * - null/undefined: false
 */
function isFilledValue(value: unknown): boolean {
  if (isNil(value)) return false;
  switch (typeof value) {
    case "number":
    case "boolean":
      return true;
    case "string":
      return value.trim() !== "";
    default:
      if (isEmpty(value)) return false;
      if (Array.isArray(value)) return value.every(isFilledValue);
      return Object.values(value as Record<string, unknown>).every(isFilledValue);
  }
}

/** All possible field names that can appear in any FilterSpecLeaf variant. */
type FilterSpecLeafKey = DistributiveKeys<FilterSpecLeaf<string>>;

/** Leaf type discriminators (excludes the placeholder `undefined` variant). */
type FilterSpecLeafType = Exclude<FilterSpecLeaf<unknown>, { type: undefined }>["type"];

type LeafOfType<T extends FilterSpecLeafType> = Extract<FilterSpecLeaf<unknown>, { type: T }>;

type RequiredKeys<O> = { [K in keyof O]-?: {} extends Pick<O, K> ? never : K }[keyof O];

/** Required field keys of a given leaf variant (excluding the `type` discriminator). */
type RequiredLeafKeys<T extends FilterSpecLeafType> = Exclude<RequiredKeys<LeafOfType<T>>, "type">;

/** Exact per-type shape — adding a key not required by that variant becomes a type error. */
type RequiredKeysByType = { readonly [T in FilterSpecLeafType]: readonly RequiredLeafKeys<T>[] };

/** Compile-time check: every key in the tuple is a valid leaf key (via satisfies). */
const KNOWN_LEAF_KEYS_TUPLE: UnionToTuples<FilterSpecLeafKey> = [
  "n",
  "x",
  "rhs",
  "type",
  "value",
  "column",
  "minDiff",
  "maxEdits",
  "wildcard",
  "replacement",
  "substitutionsOnly",
];
const KNOWN_LEAF_KEYS: Set<FilterSpecLeafKey> = new Set(KNOWN_LEAF_KEYS_TUPLE);

/** Required fields per leaf type. Optional fields (e.g. minDiff, maxEdits) excluded. */
const REQUIRED_KEYS_BY_TYPE = {
  isNA: ["column"],
  isNotNA: ["column"],
  ifNa: ["column", "replacement"],
  patternEquals: ["column", "value"],
  patternNotEquals: ["column", "value"],
  patternContainSubsequence: ["column", "value"],
  patternNotContainSubsequence: ["column", "value"],
  patternMatchesRegularExpression: ["column", "value"],
  patternFuzzyContainSubsequence: ["column", "value"],
  inSet: ["column", "value"],
  notInSet: ["column", "value"],
  topN: ["column", "n"],
  bottomN: ["column", "n"],
  equal: ["column", "x"],
  notEqual: ["column", "x"],
  lessThan: ["column", "x"],
  greaterThan: ["column", "x"],
  lessThanOrEqual: ["column", "x"],
  greaterThanOrEqual: ["column", "x"],
  equalToColumn: ["column", "rhs"],
  lessThanColumn: ["column", "rhs"],
  greaterThanColumn: ["column", "rhs"],
  lessThanColumnOrEqual: ["column", "rhs"],
  greaterThanColumnOrEqual: ["column", "rhs"],
} as const satisfies RequiredKeysByType;
