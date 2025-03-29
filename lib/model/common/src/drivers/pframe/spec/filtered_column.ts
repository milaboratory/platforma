import type { PValue } from '../data';
import type { AnchoredPColumnId } from './selectors';

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
export type FilteredPColumn<CID = AnchoredPColumnId, AFI = AxisFilter> = {
  /** The original column identifier */
  source: CID;

  /**
   * List of fixed axes and their corresponding values.
   * Each entry fixes one axis to a specific value, creating a slice of the multidimensional data.
   * This effectively reduces the dimensionality by one for each fixed axis.
   * Ordered by the axis index in canonical case.
   */
  axisFilters: AFI[];
};

export type FilteredPColumnId = FilteredPColumn<AnchoredPColumnId, AxisFilterByIdx>;

/**
 * Checks if a given value is a FilteredPColumn
 * @param id - The value to check
 * @returns True if the value is a FilteredPColumn, false otherwise
 */
export function isFilteredPColumn(id: unknown): id is FilteredPColumn {
  return typeof id === 'object' && id !== null && 'source' in id && 'axisFilters' in id;
}
