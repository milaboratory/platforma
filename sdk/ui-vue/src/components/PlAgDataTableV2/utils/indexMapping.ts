import type { PTableColumnId, PTableColumnSpec } from "@platforma-sdk/model";
import { canonicalizeJson, getPTableColumnId } from "@platforma-sdk/model";
import { isNil } from "es-toolkit";

/**
 * Builds a mapping from full spec indices to visible spec indices.
 * For specs not present in the visible set, the mapped value is -1.
 */
export function buildIndexMapping(
  fullSpecs: PTableColumnSpec[],
  visibleSpecs: PTableColumnSpec[],
): Map<number, number> {
  const specId = (spec: PTableColumnSpec) =>
    canonicalizeJson<PTableColumnId>(getPTableColumnId(spec));

  const visibleSpecsMap = new Map(visibleSpecs.entries().map(([i, spec]) => [specId(spec), i]));

  return new Map(
    fullSpecs.entries().map(([i, spec]) => {
      const visibleSpecIdx = visibleSpecsMap.get(specId(spec));
      return isNil(visibleSpecIdx) ? [i, -1] : [i, visibleSpecIdx];
    }),
  );
}
