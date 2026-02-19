import { DistributiveKeys, UnionToTuples } from "@milaboratories/helpers";
import {
  RootFilterSpec,
  type FilterSpec,
  type FilterSpecLeaf,
} from "@milaboratories/pl-model-common";
import { traverseFilterSpec } from "./traverse";
import { InferFilterSpecLeaf } from "@milaboratories/pl-model-common";

/** All possible field names that can appear in any FilterSpecLeaf variant. */
type FilterSpecLeafKey = DistributiveKeys<FilterSpecLeaf<string>>;

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

/** Returns true if the leaf is filled — type is defined and no required fields are undefined. */
function isFilledLeaf(node: Record<string, unknown>): boolean {
  if (node.type == null) return false;
  return !Object.values(node).some((v) => v === undefined);
}

function distillLeaf(node: Record<string, unknown>): FilterSpecLeaf<string> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (KNOWN_LEAF_KEYS.has(key as FilterSpecLeafKey)) {
      result[key] = value;
    }
  }
  return result as FilterSpecLeaf<string>;
}

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
      if (!isFilledLeaf(leaf as Record<string, unknown>)) return null;
      return distillLeaf(leaf as Record<string, unknown>) as R;
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
