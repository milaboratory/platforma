import {
  createColumnValueId,
  parseJsonSafely,
  type ColumnValue,
  type ColumnValueId,
  type PColumnKey,
} from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../render";
import type { ColumnRecipe } from "./column_recipes/types";
import { hasReachableData } from "./utils";

/** One cell of a column: its key, its value, and the id a value picker stores for the value. */
export type ColumnValueEntry = {
  readonly key: PColumnKey;
  readonly value: ColumnValue;
  readonly id: ColumnValueId;
};

/** Drop-down option for a value of a column — column-value-id valued. */
export type ColumnValueOption = {
  readonly value: ColumnValueId;
  readonly label: string;
};

/**
 * Every non-empty cell of a column whose values are stored inline as JSON — the small columns
 * users pick values of, such as sample metadata. Each entry's id names `recipe` as the column
 * the value came from.
 *
 * `undefined` while the data is not ready, and for a column whose data cannot be read here: one
 * that is not a leaf (see `hasReachableData`) or not stored as `PColumnData/Json` /
 * `PColumnData/JsonPartitioned`.
 */
export function readColumnValues(recipe: ColumnRecipe): ColumnValueEntry[] | undefined {
  if (!hasReachableData(recipe)) return undefined;
  const data = recipe.getData();
  if (!(data instanceof TreeNodeAccessor)) return undefined;
  const cells = readJsonCells(data);
  if (cells === undefined) return undefined;

  const entries: ColumnValueEntry[] = [];
  for (const [key, value] of cells) {
    if (!isColumnValue(value)) continue;
    entries.push({
      key,
      value,
      id: createColumnValueId({ column: recipe.id, value }),
    });
  }
  return entries;
}

/**
 * Distinct values among `entries` as options, labelled by the value itself and ordered
 * naturally by label ("R2" before "R10").
 */
export function deriveColumnValueOptions(
  entries: readonly ColumnValueEntry[],
): ColumnValueOption[] {
  const options = new Map<ColumnValueId, ColumnValueOption>();
  for (const { id, value } of entries) {
    if (!options.has(id)) options.set(id, { value: id, label: String(value) });
  }
  return [...options.values()].sort((a, b) => compareNatural(a.label, b.label));
}

// Internals

const RT_JSON = "PColumnData/Json";
const RT_JSON_PARTITIONED = "PColumnData/JsonPartitioned";

const CHUNKS = /\d+|\D+/g;

type JsonColumnData = { data?: Record<string, unknown> };

function readJsonCells(acc: TreeNodeAccessor): [PColumnKey, unknown][] | undefined {
  const rt = acc.resourceType.name;

  if (rt === RT_JSON) {
    const data = acc.getDataAsJsonOrUndefined<JsonColumnData>()?.data;
    if (data === undefined) return undefined;
    return Object.entries(data).map(([key, value]) => [parseKey(key), value]);
  }

  if (rt === RT_JSON_PARTITIONED) {
    if (!acc.getIsReadyOrError()) return undefined;
    const cells: [PColumnKey, unknown][] = [];
    for (const partKey of acc.listInputFields()) {
      const part = acc.resolve({ field: partKey, assertFieldType: "Input" });
      const data = part?.getDataAsJsonOrUndefined<JsonColumnData>()?.data;
      if (data === undefined) return undefined;
      // A partitioned key holds the partition axes; each part's own keys hold the rest.
      const partitionKey = parseKey(partKey);
      for (const [key, value] of Object.entries(data)) {
        cells.push([[...partitionKey, ...parseKey(key)], value]);
      }
    }
    return cells;
  }

  return undefined;
}

/**
 * Natural order: runs of digits compare as numbers, other text case-insensitively, so "R2"
 * comes before "R10". The model runtime has no `Intl`.
 */
function compareNatural(a: string, b: string): number {
  const chunksA = a.match(CHUNKS) ?? [];
  const chunksB = b.match(CHUNKS) ?? [];
  for (let i = 0; i < Math.min(chunksA.length, chunksB.length); i++) {
    const order = compareChunks(chunksA[i], chunksB[i]);
    if (order !== 0) return order;
  }
  return chunksA.length - chunksB.length || compareStrings(a, b);
}

function compareChunks(a: string, b: string): number {
  if (isDigits(a) && isDigits(b)) {
    // Compared as digit strings, so numbers of any length keep their order.
    const numberA = a.replace(/^0+(?=\d)/, "");
    const numberB = b.replace(/^0+(?=\d)/, "");
    return numberA.length - numberB.length || compareStrings(numberA, numberB);
  }
  return compareStrings(a.toLowerCase(), b.toLowerCase());
}

function isDigits(chunk: string): boolean {
  return chunk.charCodeAt(0) >= 48 && chunk.charCodeAt(0) <= 57;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A JSON-serialized key tuple; anything else is taken as a one-element key. */
function parseKey(keyJson: string): PColumnKey {
  const parsed = parseJsonSafely(keyJson);
  if (Array.isArray(parsed) && parsed.every(isKeyElement)) return parsed;
  return [keyJson];
}

function isKeyElement(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/** A value a picker can store: a string other than the empty one, or a finite number. */
function isColumnValue(value: unknown): value is ColumnValue {
  return (typeof value === "string" && value !== "") || Number.isFinite(value);
}
