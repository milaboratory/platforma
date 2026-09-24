import type { AccessorLike, ColumnsSourceError, LeafEntry } from "./types";

/**
 * State of one input field of a column (`<name>.spec` or `<name>.data`):
 *
 *  - `present`:   the field has a value; `node` is the resource it points to.
 *  - `resolving`: the field may still appear or get its value.
 *  - `absent`:    the field is not there and the inputs are locked, so it never will be.
 *  - `errored`:   the field carries an error, with or without a value.
 */
export type ColumnFieldRead<A extends AccessorLike<A>> =
  | { readonly status: "present"; readonly node: A }
  | { readonly status: "resolving" }
  | { readonly status: "absent" }
  | { readonly status: "errored"; readonly error: Error };

/**
 * Read input field `field` of `accessor` without throwing on its error. The
 * error is checked before the value, so a field that has both reads as
 * `errored`.
 */
export function readColumnField<A extends AccessorLike<A>>(
  accessor: A,
  field: string,
): ColumnFieldRead<A> {
  if (!accessor.listInputFields().includes(field)) {
    return accessor.getInputsLocked() ? { status: "absent" } : { status: "resolving" };
  }
  const error = accessor.getFieldError(field);
  if (error !== undefined) return { status: "errored", error };
  const node = accessor.traverse({ field, assertFieldType: "Input", ignoreError: true });
  return node === undefined ? { status: "resolving" } : { status: "present", node };
}

/** Errors carried by the `.spec` and `.data` fields of the column `entry` points at. */
export function columnFieldErrors<A extends AccessorLike<A>>(
  entry: LeafEntry<A>,
): ColumnsSourceError[] {
  return COLUMN_FIELDS.flatMap((field): ColumnsSourceError[] => {
    const read = readColumnField(entry.accessor, `${entry.name}.${field}`);
    if (read.status !== "errored") return [];
    return [{ kind: "column", id: entry.id, field, message: read.error.message }];
  });
}

/** Whether the `.spec` field of the column `entry` points at carries an error. */
export function hasErroredSpec<A extends AccessorLike<A>>(entry: LeafEntry<A>): boolean {
  return readColumnField(entry.accessor, `${entry.name}.spec`).status === "errored";
}

//
// Internals
//

const COLUMN_FIELDS = ["spec", "data"] as const;
