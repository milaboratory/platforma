import type { AnchoredPColumnId } from "./selectors";
import {
  applyAxisFilters,
  isColumnFilteredKey,
  type ColumnFilteredId,
  type ColumnFilteredKey,
  type FilteredPColumnId,
} from "./filtered_column";
import {
  createPObjectId,
  isPObjectId,
  isPObjectKey,
  LocalPObjectKey,
  type GlobalPObjectId,
  type GlobalPObjectKey,
  type LocalPObjectId,
  type PObjectId,
} from "../../../pool";
import {
  isColumnDiscoveredKey,
  type ColumnDiscoveredId,
  type ColumnDiscoveredKey,
} from "./discovered_column";
import { throwError } from "@milaboratories/helpers";
import {
  applySpecOverrides,
  isColumnOverriddenKey,
  type ColumnOverriddenId,
  type ColumnOverriddenKey,
} from "./overrided";
import { canonicalizeJson } from "../../../json";
import { AxisSpec, PColumnSpec } from "./spec";
import { isString } from "es-toolkit";

/**
 * Per-axis patches keyed by positional index in the base spec's `axesSpec`.
 *
 * Using position rather than `name` lets us disambiguate linker-style specs
 * that carry multiple axes with the same `name` differentiated by `domain` /
 * `contextDomain` (e.g. a `group`, `group/primary`, `group/secondary` triple).
 *
 * A patch at index `>= base.axesSpec.length` appends a new axis at that slot.
 */
export type AxisPatches = Record<number, Partial<AxisSpec>>;

/**
 * Universal column identifier optionally anchored and optionally filtered.
 * @deprecated use {@link ColumnUniversalKey}
 */
export type UniversalPColumnId = AnchoredPColumnId | FilteredPColumnId;

/**
 * Canonically serialized {@link UniversalPColumnId}.
 * @deprecated use {@link ColumnUniversalId}
 */
export type SUniversalPColumnId = ColumnUniversalId;
// export type SUniversalPColumnId = Branded<PObjectId, "SUniversalPColumnId", "__pl_model_brand_2__">;

export type ColumnUniversalKey =
  | LocalPObjectKey
  | GlobalPObjectKey
  | ColumnFilteredKey
  | ColumnDiscoveredKey
  | ColumnOverriddenKey;

export type ColumnUniversalId =
  | LocalPObjectId
  | GlobalPObjectId
  | ColumnFilteredId
  | ColumnDiscoveredId
  | ColumnOverriddenId;

/**
 * Canonically serializes a column key to a branded string id. Accepts both
 * the new {@link ColumnUniversalKey} and the deprecated {@link UniversalPColumnId}
 * (anchored / old filtered object form).
 */
export function stringifyColumnId(id: ColumnUniversalKey | UniversalPColumnId): ColumnUniversalId {
  return canonicalizeJson(id) as ColumnUniversalId;
}

/**
 * Parses a canonically serialized column id back to its key form.
 */
export function parseColumnId(str: ColumnUniversalId): ColumnUniversalKey {
  return JSON.parse(str) as ColumnUniversalKey;
}

export function parseColumnIdSafety(
  str: ColumnUniversalId,
  fallback = undefined,
): ColumnUniversalKey | typeof fallback {
  try {
    return JSON.parse(str) as ColumnUniversalKey;
  } catch {
    return fallback;
  }
}

/**
 * Walk a rich column id down to its terminal leaf {@link PObjectId}.
 */
export function extractPObjectId(id: ColumnUniversalId | ColumnUniversalKey): PObjectId {
  if (isString(id)) {
    if (isPObjectId(id)) return id;

    const parsed =
      parseColumnIdSafety(id) ??
      throwError(`extractPObjectId: id "${id}" is not a valid canonical column id`);
    return extractPObjectId(parsed);
  }

  if (isPObjectKey(id)) return createPObjectId(id);
  if (isColumnFilteredKey(id)) return extractPObjectId(id.source);
  if (isColumnOverriddenKey(id)) return extractPObjectId(id.source);
  if (isColumnDiscoveredKey(id)) return extractPObjectId(id.column);

  throw new Error(`extractPObjectId: unrecognized column id structure: ${JSON.stringify(id)}`);
}

/**
 * Reconstruct the effective {@link PColumnSpec} for a rich column id by walking
 * the id chain from leaf to outermost wrapper, applying each layer's spec
 * transformation in the same order the corresponding recipe would.
 *
 * Layer semantics:
 * - Leaf ({@link LocalPObjectKey} / {@link GlobalPObjectKey}): no transformation.
 * - {@link ColumnDiscoveredKey}: pass-through, descends into `column`.
 * - {@link ColumnFilteredKey}: drops the axes whose positional index appears in
 *   `axisFilters[i][0]` from the inner spec's `axesSpec` — mirrors
 *   `ColumnFilteredRecipe.getSpec()`.
 * - {@link ColumnOverriddenKey}: applies `specOverrides` via
 *   {@link applySpecOverrides} on top of the inner spec.
 */
export function reconstructSpecFromId(
  baseSpec: PColumnSpec,
  id: ColumnUniversalId | ColumnUniversalKey,
): PColumnSpec {
  if (isString(id)) {
    if (isPObjectId(id)) return baseSpec;

    const parsed =
      parseColumnIdSafety(id) ??
      throwError(`reconstructSpecFromId: id "${id}" is not a valid canonical column id`);
    return reconstructSpecFromId(baseSpec, parsed);
  }

  if (isPObjectKey(id)) return baseSpec;
  if (isColumnDiscoveredKey(id)) return reconstructSpecFromId(baseSpec, id.column);
  if (isColumnFilteredKey(id)) {
    return applyAxisFilters(reconstructSpecFromId(baseSpec, id.source), id.axisFilters);
  }
  if (isColumnOverriddenKey(id)) {
    const inner = reconstructSpecFromId(baseSpec, id.source);
    return applySpecOverrides(inner, id.specOverrides);
  }

  throw new Error(`reconstructSpecFromId: unrecognized column id structure: ${JSON.stringify(id)}`);
}
