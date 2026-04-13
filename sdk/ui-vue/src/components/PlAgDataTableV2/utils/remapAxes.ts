import type { AxesSpec, AxisId, PTableKey } from "@platforma-sdk/model";
import { getAxisId, matchAxisId } from "@platforma-sdk/model";

/**
 * Compute a mapping from source axes to target axes.
 * Returns null if the mapping is invalid (different lengths, missing axes, or duplicates).
 */
export function computeAxesMapping(sourceAxes: AxesSpec, targetAxes: AxesSpec): number[] | null {
  if (sourceAxes.length !== targetAxes.length) return null;

  const mapping = sourceAxes
    .map(getAxisId)
    .map((id: AxisId) => targetAxes.findIndex((axis) => matchAxisId(axis, id)));

  const mappingSet = new Set(mapping);
  if (mappingSet.has(-1) || mappingSet.size !== sourceAxes.length) return null;

  return mapping;
}

/**
 * Remap keys from source axes order to target axes order.
 * Returns null if remapping is not possible.
 */
export function remapKeys(
  sourceAxes: AxesSpec,
  targetAxes: AxesSpec,
  keys: PTableKey[],
): PTableKey[] | null {
  const mapping = computeAxesMapping(sourceAxes, targetAxes);
  if (mapping === null) return null;

  return keys.map((key) => mapping.map((index) => key[index]));
}
