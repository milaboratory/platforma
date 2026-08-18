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
  isGlobalPObjectKey,
  isLocalPObjectKey,
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
} from "./overridden";
import { canonicalizeJson, parseJsonSafely } from "../../../json";
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

export function parseColumnIdSafely(
  str: ColumnUniversalId,
  fallback = undefined,
): ColumnUniversalKey | typeof fallback {
  try {
    return JSON.parse(str) as ColumnUniversalKey;
  } catch {
    return fallback;
  }
}

/** Whether `value` is any of the five key forms a {@link ColumnUniversalId} serializes. */
export function isColumnUniversalKey(value: unknown): value is ColumnUniversalKey {
  return (
    isPObjectKey(value) ||
    isColumnFilteredKey(value) ||
    isColumnDiscoveredKey(value) ||
    isColumnOverriddenKey(value)
  );
}

export function isColumnUniversalId(value: unknown): value is ColumnUniversalId {
  const key = isString(value) ? parseJsonSafely(value, false) : false;
  return key === false ? false : isColumnUniversalKey(key);
}

/**
 * A JSON string with its escape padding taken off, and how many passes that took.
 *
 * `layers` counts the `JSON.stringify` passes *above* the encoded value: a canonical id
 * is `layers: 0`, the same id run through `JSON.stringify` once more is `layers: 1`. Keep
 * it to put the value back the way it was found.
 */
export type PeeledJsonLayers = {
  readonly value: unknown;
  readonly layers: number;
};

/**
 * Take a value out of however many `JSON.stringify` passes wrapped it, or `undefined`
 * when `s` is not JSON at all.
 *
 * The one definition of "how a value can be hiding inside a string" — a block id can sit
 * under several layers of escaping, and a walk over object properties reaches none of
 * them. Callers differ in what they do at the bottom (this deliberately says nothing
 * about which values count as identifiers), but they must agree on the mechanics, or
 * "what carries a block id" ends up with two answers that drift.
 *
 * The gate is cheap and does NOT require any marker in the body: a filtered id whose
 * innermost leaf is a {@link LocalPObjectKey} carries no `__isRef`, so demanding one
 * would miss it.
 */
export function peelJsonLayers(s: string): PeeledJsonLayers | undefined {
  let current = s;
  let layers = 0;
  for (;;) {
    const c0 = current.charCodeAt(0);
    if (c0 !== 0x7b /* { */ && c0 !== 0x22 /* " */) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(current);
    } catch {
      return undefined;
    }
    // A pass that yielded another string was escape padding, so peel again. The string
    // is strictly shorter each time, which is what bounds the loop.
    if (isString(parsed)) {
      if (parsed.length >= current.length) return undefined;
      current = parsed;
      layers++;
      continue;
    }
    return { value: parsed, layers };
  }
}

/**
 * Rewrite every block id buried inside a column id.
 *
 * A {@link GlobalPObjectKey} leaf names its upstream by block id, and the wrapper key forms
 * nest by *string* id rather than by object — so a block id can sit under several layers of
 * JSON escaping, and `queriesQualifications` carries one in a map *key*. A caller that only
 * walks object properties never reaches any of them, which is why moving a column id between
 * projects needs this rather than a generic walk.
 *
 * Recursion re-canonicalizes bottom-up, so every level is canonical afterwards — including
 * the rebuilt `queriesQualifications`, whose keys the canonical form sorts. That is the
 * property a textual rewrite cannot have: redirecting an id that is a map key changes what
 * the sorted order should be, and only rebuilding restores it.
 *
 * Returns the input itself when no block id changed, so a caller mapping ids to themselves
 * gets its value back byte-for-byte and never re-serializes a stored id. Any `string` is
 * accepted for the same reason: a caller sweeping a params object cannot know which of its
 * strings are ids, and one that is not is returned as-is.
 *
 * @param remapBlockId old block id → new block id. Throw from it to reject an id that cannot
 *   be mapped.
 */
export function remapColumnIdBlockIds<T extends string | ColumnUniversalKey>(
  id: T,
  remapBlockId: (blockId: string) => string,
): T {
  const remapped = isString(id) ? remapIdString(id, remapBlockId) : remapKey(id, remapBlockId);
  return (remapped ?? id) as T;
}

/**
 * The string half of {@link remapColumnIdBlockIds}. `undefined` means "nothing to change",
 * which is what keeps an unaffected id from being re-serialized.
 *
 * Escape padding is peeled and put back, so an id that reached params through an extra
 * `JSON.stringify` is rewritten in place and comes back wrapped as it was found. A string
 * that does not peel to a column key is left alone: params hold ordinary strings too.
 */
function remapIdString(id: string, remapBlockId: (blockId: string) => string): string | undefined {
  const peeled = peelJsonLayers(id);
  if (peeled === undefined || !isColumnUniversalKey(peeled.value)) return undefined;

  const remappedKey = remapKey(peeled.value, remapBlockId);
  if (remappedKey === undefined) return undefined;

  let rebuilt: string = stringifyColumnId(remappedKey);
  for (let layer = 0; layer < peeled.layers; layer++) rebuilt = JSON.stringify(rebuilt);
  return rebuilt;
}

/** The key half of {@link remapColumnIdBlockIds}. `undefined` means "nothing to change". */
function remapKey(
  key: ColumnUniversalKey,
  remapBlockId: (blockId: string) => string,
): ColumnUniversalKey | undefined {
  if (isGlobalPObjectKey(key)) {
    const blockId = remapBlockId(key.blockId);
    return blockId === key.blockId ? undefined : { ...key, blockId };
  }

  // A local leaf names its column by a path inside its own block — no block id.
  if (isLocalPObjectKey(key)) return undefined;

  if (isColumnFilteredKey(key)) {
    const source = remapIdString(key.source, remapBlockId);
    return source === undefined ? undefined : { ...key, source: source as ColumnUniversalId };
  }

  if (isColumnOverriddenKey(key)) {
    const source = remapIdString(key.source, remapBlockId);
    // Remapping preserves the id's shape, so `source` is still not an Overridden id.
    return source === undefined
      ? undefined
      : { ...key, source: source as ColumnOverriddenKey["source"] };
  }

  if (isColumnDiscoveredKey(key)) return remapDiscoveredKey(key, remapBlockId);

  throw new Error(
    `remapColumnIdBlockIds: unrecognized column id structure: ${JSON.stringify(key)}`,
  );
}

/**
 * Discovered is the only key form carrying more than one nested id: the column it
 * discovered, one per linker hop, and one per entry in `queriesQualifications` — where the
 * id is the map key, not the value.
 */
function remapDiscoveredKey(
  key: ColumnDiscoveredKey,
  remapBlockId: (blockId: string) => string,
): ColumnDiscoveredKey | undefined {
  const column = remapIdString(key.column, remapBlockId);

  let pathChanged = false;
  const path = key.path?.map((item) => {
    const itemColumn = remapIdString(item.column, remapBlockId);
    if (itemColumn === undefined) return item;
    pathChanged = true;
    return { ...item, column: itemColumn as ColumnUniversalId };
  });

  let queriesChanged = false;
  const queriesQualifications =
    key.queriesQualifications &&
    (Object.fromEntries(
      Object.entries(key.queriesQualifications).map(([queryId, qualifications]) => {
        const remappedId = remapIdString(queryId, remapBlockId);
        if (remappedId === undefined) return [queryId, qualifications];
        queriesChanged = true;
        return [remappedId, qualifications];
      }),
    ) as ColumnDiscoveredKey["queriesQualifications"]);

  if (column === undefined && !pathChanged && !queriesChanged) return undefined;
  return {
    ...key,
    ...(column !== undefined ? { column: column as ColumnUniversalId } : {}),
    ...(pathChanged ? { path } : {}),
    ...(queriesChanged ? { queriesQualifications } : {}),
  };
}

/**
 * Walk a rich column id down to its terminal leaf {@link PObjectId}.
 */
export function extractPObjectId(id: ColumnUniversalId | ColumnUniversalKey): PObjectId {
  if (isString(id)) {
    if (isPObjectId(id)) return id;

    const parsed =
      parseColumnIdSafely(id) ??
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
      parseColumnIdSafely(id) ??
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
