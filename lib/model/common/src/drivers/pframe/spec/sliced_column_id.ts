import type { PValue } from '../data';
import type { APColumnId } from './selectors';

/** Axis filter by index */
export type AxisFilterByIdx = [number, PValue];

/** Axis filter by name */
export type AxisFilterByName = [string, PValue];

/** Axis filter */
export type AxisFilter = AxisFilterByIdx | AxisFilterByName;

/**
 * Identifies a column derived from a CanonicalPColumnId by fixing values on certain axes,
 * thus effectively reducing the dimensionality of the original column.
 */
export type SlicedPColumnId<CID = APColumnId, AFI = AxisFilter> = {
  /** The original canonical column identifier */
  target: CID;

  /**
   * List of fixed axes and their corresponding values.
   * Each entry fixes one axis to a specific value, creating a slice of the multidimensional data.
   * This effectively reduces the dimensionality by one for each fixed axis.
   * Ordered by the axis index in canonical case.
   */
  axisFilters: AFI[];
};

/**
 * Checks if a given value is a SlicedPColumnId
 * @param id - The value to check
 * @returns True if the value is a SlicedPColumnId, false otherwise
 */
export function isSlicedPColumnId(id: unknown): id is SlicedPColumnId {
  return typeof id === 'object' && id !== null && 'target' in id && 'axisFilters' in id;
}
