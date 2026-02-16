import { DistributiveKeys, UnionToTuples } from "@milaboratories/helpers";
import {
  type FilterSpec,
  type FilterSpecLeaf,
  type PTableFilters,
} from "@milaboratories/pl-model-common";

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

type UnknownFilterNode = FilterSpec<
  FilterSpecLeaf<string>,
  Record<string, unknown>,
  Record<string, unknown>
>;

function distillLeaf(node: Record<string, unknown>): FilterSpecLeaf<string> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (KNOWN_LEAF_KEYS.has(key as FilterSpecLeafKey)) {
      result[key] = value;
    }
  }
  return result as FilterSpecLeaf<string>;
}

function distillNode(node: UnknownFilterNode): FilterSpec<FilterSpecLeaf<string>> {
  switch (node.type) {
    case "and":
    case "or":
      return { type: node.type, filters: node.filters.map(distillNode) };
    case "not":
      return { type: "not", filter: distillNode(node.filter) };
    default:
      return distillLeaf(node as Record<string, unknown>);
  }
}

/** Strips all non-FilterSpec metadata from the filter tree (whitelist approach). */
export function distillFilter(filter: UnknownFilterNode | null | undefined): PTableFilters {
  if (filter == null) return null;
  return distillNode(filter);
}
