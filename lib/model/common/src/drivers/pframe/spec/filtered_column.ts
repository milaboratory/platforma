import { type Branded } from "@milaboratories/helpers";
import { type CanonicalizedJson, canonicalizeJson, parseJsonSafely } from "../../../json";
import type { AnchoredPColumnId } from "./selectors";
import { ColumnUniversalId } from "./ids";
import type { PColumnSpec } from "./spec";

/** Value of an axis filter */
export type AxisFilterValue = number | string;

/** Axis filter by index */
export type AxisFilterByIdx = [number, AxisFilterValue];

/** Axis filter by name */
export type AxisFilterByName = [string, AxisFilterValue];

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

/** @deprecated */
export type FilteredPColumnId = FilteredPColumn<AnchoredPColumnId, AxisFilterByIdx>;

/**
 * Checks if a given value is a FilteredPColumn
 * @param id - The value to check
 * @returns True if the value is a FilteredPColumn, false otherwise
 * @deprecated use {@link isColumnFilteredKey} for the key form and `source` checks for the id form
 */
export function isFilteredPColumn(id: unknown): id is FilteredPColumn {
  return typeof id === "object" && id !== null && "source" in id && "axisFilters" in id;
}

/**
 * `source` is either a leaf {@link PObjectId} or a {@link ColumnDiscoveredId}.
 * Filtered never nests inside Filtered (flat-merge invariant), and Filtered is
 * never the outer wrapper around Overridden — Overridden is always outermost.
 */
export interface ColumnFilteredKey {
  __isFiltered: true;
  source: ColumnUniversalId;
  axisFilters: AxisFilterByIdx[];
}

export type ColumnFilteredId = Branded<CanonicalizedJson<ColumnFilteredKey>, "ColumnFilteredId">;

export function stringifyColumnFilteredId(
  key: Omit<ColumnFilteredKey, "__isFiltered">,
): ColumnFilteredId {
  return canonicalizeJson<ColumnFilteredKey>(createColumnFilteredKey(key)) as ColumnFilteredId;
}

export function isColumnFilteredKey(obj: unknown): obj is ColumnFilteredKey {
  return typeof obj === "object" && obj !== null && "__isFiltered" in obj;
}

export function isColumnFilteredId(id: unknown): id is ColumnFilteredId {
  if (typeof id !== "string") return false;
  return isColumnFilteredKey(parseJsonSafely(id));
}

export function createColumnFilteredId(props: {
  source: ColumnUniversalId;
  axisFilters: AxisFilterByIdx[];
}): ColumnFilteredId {
  return stringifyColumnFilteredId(props);
}

export function createColumnFilteredKey(props: {
  source: ColumnUniversalId;
  axisFilters: AxisFilterByIdx[];
}): ColumnFilteredKey {
  // `axisFilters` must be ordered by axis index so logically
  // identical filtered columns produce one canonical id.
  const axisFilters = props.axisFilters.toSorted((a, b) => a[0] - b[0]);
  return { __isFiltered: true, source: props.source, axisFilters };
}

/**
 * Drop the axes pinned by `axisFilters` from a {@link PColumnSpec}'s
 * `axesSpec`. Indices are positional against `spec.axesSpec`. Returns `spec`
 * unchanged when there are no filters.
 *
 * Single source of the Filtered-layer spec math — shared by
 * `reconstructSpecFromId` (host, id-walking) and `ColumnFilteredRecipe.getSpec`
 * (sandbox, recipe-graph walking).
 */
export function applyAxisFilters(spec: PColumnSpec, axisFilters: AxisFilterByIdx[]): PColumnSpec {
  if (axisFilters.length === 0) return spec;
  const fixed = new Set(axisFilters.map(([i]) => i));
  return { ...spec, axesSpec: spec.axesSpec.filter((_, i) => !fixed.has(i)) };
}
