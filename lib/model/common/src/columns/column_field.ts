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

/**
 * Decode an error node's content into a display message. The backend serializes
 * a resource error as `{"message": "..."}` (`ResourceError`); unwrap that to the
 * human-readable message. Falls back to the raw string when the content is not
 * that envelope (e.g. plain text, or an unexpected shape).
 */
export function decodeErrorMessage(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isMessageEnvelope(parsed)) return parsed.message;
  } catch {
    // Not JSON — surface the raw content.
  }
  return raw;
}

/** Message of the error resource attached to `accessor` itself, if it has one. */
export function resourceErrorMessage<A extends AccessorLike<A>>(accessor: A): string | undefined {
  const error = accessor.getError();
  if (error === undefined) return undefined;
  const raw = error.getDataAsString();
  return raw === undefined ? "Resource computation failed." : decodeErrorMessage(raw);
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

function isMessageEnvelope(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}
