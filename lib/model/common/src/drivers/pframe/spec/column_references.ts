import { isString } from "es-toolkit";
import { parseJsonSafely } from "../../../json";
import {
  createPObjectId,
  isGlobalPObjectKey,
  isPObjectKey,
  type GlobalPObjectKey,
} from "../../../pool";
import { isColumnValueKey, type ColumnValue } from "./column_value";
import {
  extractPObjectId,
  isColumnUniversalKey,
  peelJsonLayers,
  stringifyColumnId,
  type ColumnUniversalId,
  type ColumnUniversalKey,
} from "./ids";

/** Another block's args reference an output of this block. */
export interface OutputDependency {
  /** The block whose args hold the reference. */
  dependentBlockId: string;
  /** Name of this block's output. */
  output: string;
  /** The output as the dependent block referenced it: the plain output, or a filtered, discovered or overridden column over it. */
  ref: ColumnUniversalId;
  /** Values of that column the dependent block picked, in args order; `null` when it picked none and uses the output as a whole. */
  values: null | ColumnValue[];
}

/** A column a block's args reference, with the values of it they picked. */
export interface ColumnReference {
  /**
   * The column id in canonical form. A plain output is the bare
   * `{ __isRef, blockId, name }` id whether the args held it with `requireEnrichments` or
   * without, as an object or as a string.
   */
  ref: ColumnUniversalId;
  /** Distinct picked values in the order first met; `null` when the args picked none. */
  values: null | ColumnValue[];
}

/**
 * Every column `args` reference, each once, in the order first met.
 *
 * Found the way block dependencies are found in args: array items, object values and object
 * keys are all visited, and a string is searched under any number of `JSON.stringify` passes.
 * Three things reference a column:
 * - a ref object `{ __isRef, blockId, name }` or any other column key object;
 * - a column id string — a leaf, filtered, discovered or overridden id. Only the outermost id
 *   counts: the ids nested inside a wrapper describe how the column is built, they are not
 *   columns the args use on their own;
 * - a column value id string, which picks a value of its column. It adds the value to that
 *   column's reference and makes the column referenced if nothing else in `args` does.
 *
 * Only the string form is a column value: an object shaped like a column value key is ordinary
 * data whose nested strings are searched like any others.
 */
export function collectColumnReferences(args: unknown): ColumnReference[] {
  const found = new Map<ColumnUniversalId, PickedValues | null>();
  collectInto(found, args);
  return toReferences(found);
}

/**
 * The block output a column is computed from: the leaf of its id, since none of the wrapper
 * forms change which block produced the data. `undefined` for a local or unresolvable column: a
 * local column belongs to the block that holds the id, not to another block; an unresolvable one
 * — a wrapper with no usable leaf inside — names no block at all.
 */
export function columnProducer(id: ColumnUniversalId): GlobalPObjectKey | undefined {
  let leafId: string;
  try {
    leafId = extractPObjectId(id);
  } catch {
    return undefined;
  }
  const leaf = parseJsonSafely(leafId);
  if (!isGlobalPObjectKey(leaf)) return undefined;
  if (!isString(leaf.blockId) || !isString(leaf.name)) return undefined;
  return leaf;
}

// Internals

type PickedValues = { values: ColumnValue[]; seen: Set<ColumnValue> };

function toReferences(found: Map<ColumnUniversalId, PickedValues | null>): ColumnReference[] {
  return [...found].map(([ref, picked]) => ({
    ref,
    values: picked === null ? null : picked.values,
  }));
}

function collectInto(found: Map<ColumnUniversalId, PickedValues | null>, node: unknown): void {
  if (isString(node)) {
    const peeled = peelJsonLayers(node);
    if (peeled === undefined) return;
    if (isColumnValueKey(peeled.value)) {
      const column = parseJsonSafely(peeled.value.column);
      if (isColumnUniversalKey(column)) {
        addValue(found, canonicalColumnId(column), peeled.value.value);
      }
      return;
    }
    if (isColumnUniversalKey(peeled.value)) {
      addColumn(found, canonicalColumnId(peeled.value));
      return;
    }
    collectInto(found, peeled.value);
    return;
  }

  if (typeof node !== "object" || node === null) return;

  if (isColumnUniversalKey(node)) {
    addColumn(found, canonicalColumnId(node));
    return;
  }

  if (Array.isArray(node)) {
    for (const child of node) collectInto(found, child);
    return;
  }

  for (const [key, child] of Object.entries(node)) {
    collectInto(found, key);
    collectInto(found, child);
  }
}

function addColumn(
  found: Map<ColumnUniversalId, PickedValues | null>,
  id: ColumnUniversalId,
): void {
  if (!found.has(id)) found.set(id, null);
}

function addValue(
  found: Map<ColumnUniversalId, PickedValues | null>,
  id: ColumnUniversalId,
  value: ColumnValue,
): void {
  let picked = found.get(id);
  if (picked === undefined || picked === null) {
    picked = { values: [], seen: new Set() };
    found.set(id, picked);
  }
  if (picked.seen.has(value)) return;
  picked.seen.add(value);
  picked.values.push(value);
}

/**
 * One id per column whatever form the args held it in. A leaf is rebuilt from the fields that
 * name the column — `requireEnrichments` asks for more data from the same output and is dropped.
 */
function canonicalColumnId(key: ColumnUniversalKey): ColumnUniversalId {
  return isPObjectKey(key) ? createPObjectId(key) : stringifyColumnId(key);
}
