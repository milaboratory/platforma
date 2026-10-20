import { type Branded } from "@milaboratories/helpers";
import { isString } from "es-toolkit";
import { type CanonicalizedJson, canonicalizeJson, parseJsonSafely } from "../../../json";
import { isColumnUniversalId, type ColumnUniversalId } from "./ids";

/** A single cell value of a column, as a block passes it to its workflow. */
export type ColumnValue = string | number;

/**
 * One value of one column, picked by a block — a sample group, a condition level, an antigen.
 *
 * Not a column, and deliberately not a {@link ColumnUniversalKey} form: nothing that resolves
 * columns accepts it. `column` is the id exactly as the block picked it — a leaf, filtered,
 * discovered or overridden — and its leaf names the block that produced the value, because
 * none of the wrapper forms change cell values.
 */
export interface ColumnValueKey {
  __isColumnValue: true;
  column: ColumnUniversalId;
  value: ColumnValue;
}

/**
 * Canonically serialized {@link ColumnValueKey}. Canonical form makes two ids of the same
 * value equal as strings, so an id works as a map key and compares with `===`.
 */
export type ColumnValueId = Branded<CanonicalizedJson<ColumnValueKey>, "ColumnValueId">;

export function isColumnValueKey(obj: unknown): obj is ColumnValueKey {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "__isColumnValue" in obj &&
    obj.__isColumnValue === true &&
    "column" in obj &&
    isColumnUniversalId(obj.column) &&
    "value" in obj &&
    isColumnValue(obj.value)
  );
}

export function isColumnValueId(id: unknown): id is ColumnValueId {
  if (!isString(id)) return false;
  return isColumnValueKey(parseJsonSafely(id));
}

/**
 * Throws when `value` is not a string or a finite number, or `column` is not a column id: such
 * an id could not be read back as a {@link ColumnValueKey}.
 */
export function createColumnValueId(props: {
  column: ColumnUniversalId;
  value: ColumnValue;
}): ColumnValueId {
  const { column, value } = props;
  if (!isColumnValue(value)) {
    throw new Error(
      `createColumnValueId: value must be a string or a finite number, got ${String(value)}`,
    );
  }
  if (!isColumnUniversalId(column)) {
    throw new Error(`createColumnValueId: "${column}" is not a column id`);
  }
  return canonicalizeJson<ColumnValueKey>({
    __isColumnValue: true,
    column,
    value,
  }) as ColumnValueId;
}

/** {@link createColumnValueId} for every value of one column, in the order given. */
export function createColumnValueIds(props: {
  column: ColumnUniversalId;
  values: readonly ColumnValue[];
}): ColumnValueId[] {
  const { column, values } = props;
  return values.map((value) => createColumnValueId({ column, value }));
}

export function parseColumnValueId(id: ColumnValueId): ColumnValueKey {
  const parsed = parseJsonSafely(id);
  if (!isColumnValueKey(parsed)) {
    throw new Error(`parseColumnValueId: "${id}" is not a valid ColumnValueId`);
  }
  return parsed;
}

/**
 * Text naming a picked value to the user: the value a column value id picks, or `picked` as is
 * when it is not such an id — a plain value picked before the block used column value ids.
 */
export function columnValueLabel(picked: string): string {
  return isColumnValueId(picked) ? String(parseColumnValueId(picked).value) : picked;
}

// Internals

function isColumnValue(value: unknown): value is ColumnValue {
  return isString(value) || (typeof value === "number" && Number.isFinite(value));
}
