import type { AccessorLike, LeafEntry } from "./types";

/**
 * What the `.data` field of a column holds: the data resource, nothing yet, or
 * an error.
 */
export type LeafData<A> =
  | { readonly type: "resource"; readonly resource: A }
  | { readonly type: "unset" }
  | { readonly type: "errored"; readonly error: A };

/**
 * Reads the `.data` field of a column. The sandbox and the host both read it
 * here, so a column the host puts into a PFrame empty is the column the model
 * reports as failed.
 *
 * A field that holds an error reads as `errored` whether or not it also has a
 * value. A field that is not there, or has no value yet, reads as `unset`.
 */
export function readLeafData<A extends AccessorLike<A>>({
  accessor,
  name,
}: LeafEntry<A>): LeafData<A> {
  const field = accessor.getField({ field: `${name}.data`, assertFieldType: "Input" });
  if (field === undefined) return { type: "unset" };
  if (field.error !== undefined) return { type: "errored", error: field.error };
  if (field.value === undefined) return { type: "unset" };
  return { type: "resource", resource: field.value };
}
