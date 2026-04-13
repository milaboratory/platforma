import type { PTableColumnSpec } from "@platforma-sdk/model";
import { Annotation, readAnnotationJson } from "@platforma-sdk/model";

/**
 * Sorts column indices: axes first, then by OrderPriority annotation (descending).
 * Returns a new sorted array without mutating the input.
 */
export function sortColumns(indices: number[], fullSpecs: PTableColumnSpec[]): number[] {
  return [...indices].sort((a, b) => {
    const specA = fullSpecs[a];
    const specB = fullSpecs[b];

    if (specA.type !== specB.type) {
      return specA.type === "axis" ? -1 : 1;
    }

    const aPriority =
      specA.type === "column"
        ? (readAnnotationJson(specA.spec, Annotation.Table.OrderPriority) ?? 0)
        : 0;
    const bPriority =
      specB.type === "column"
        ? (readAnnotationJson(specB.spec, Annotation.Table.OrderPriority) ?? 0)
        : 0;

    return bPriority - aPriority;
  });
}
