import type { PValue } from '../data';
import type { CanonicalPColumnId } from './anchored_id';

/**
 * Identifies a column derived from a CanonicalPColumnId by fixing values on certain axes,
 * thus effectively reducing the dimensionality of the original column.
 */
export type SlicedPColumnId = {
  /** The original canonical column identifier */
  source: CanonicalPColumnId;
  /**
   * List of fixed axes and their corresponding values.
   * Each entry fixes one axis to a specific value, creating a slice of the multidimensional data.
   * This effectively reduces the dimensionality by one for each fixed axis.
   * Ordered by the axis index.
   * Format: [axisIndex | axisName, fixedValue]
   */
  axisFilters: [number | string, PValue][];
};

/**
 * Union type to reference either a canonical or sliced column identifier.
 */
export type GeneralizedPColumnId = CanonicalPColumnId | SlicedPColumnId;
