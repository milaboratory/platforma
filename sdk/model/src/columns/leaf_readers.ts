import { readLeafSpec, type LeafEntry } from "@milaboratories/pl-model-common";
import { LRUCache } from "lru-cache";
import type { TreeNodeAccessor } from "../render";

/** Cache `fn` per leaf accessor handle and column name. */
export function memoizeByEntry<R>(
  fn: (entry: LeafEntry<TreeNodeAccessor>) => R,
): (entry: LeafEntry<TreeNodeAccessor>) => R {
  const cache = new LRUCache<string, { value: R }>({ max: 1000 });
  return (entry) => {
    const key = `${entry.accessor.handle}:${entry.name}`;
    let hit = cache.get(key);
    if (!hit) cache.set(key, (hit = { value: fn(entry) }));
    return hit.value;
  };
}

/** Cached {@link readLeafSpec} for sandbox leaves. */
export const readSpecAccessor: (
  entry: LeafEntry<TreeNodeAccessor>,
) => ReturnType<typeof readLeafSpec<TreeNodeAccessor>> = memoizeByEntry(readLeafSpec);
