import type { AccessorLike, FieldTraversalStepLike } from "../types";

/** One resource of a fake tree: its type, input fields and JSON payload. */
export type FakeNode = {
  readonly type: string;
  readonly fields?: Readonly<Record<string, FakeField>>;
  readonly locked?: boolean;
  readonly data?: unknown;
  /** Content of the error resource attached to this node. */
  readonly error?: string;
};

/** One input field: a value, an error message, both, or neither (unset). */
export type FakeField = { readonly value?: FakeNode; readonly error?: string };

export interface FakeAccessor extends AccessorLike<FakeAccessor> {}

/**
 * Test-only accessor over a {@link FakeNode} tree. Like the host, traversing
 * a field that has an error and no value throws that error. The same node
 * always yields the same accessor, so results compare by identity.
 */
export function fakeTree(node: FakeNode): FakeAccessor {
  const cached = accessors.get(node);
  if (cached !== undefined) return cached;
  const fields = node.fields ?? {};
  const accessor: FakeAccessor = {
    resourceType: { name: node.type },
    traverse: ({ field }: FieldTraversalStepLike) => {
      const entry = fields[field];
      if (entry?.value === undefined && entry?.error !== undefined) throw new Error(entry.error);
      return entry?.value === undefined ? undefined : fakeTree(entry.value);
    },
    listInputFields: () => Object.keys(fields),
    getInputsLocked: () => node.locked ?? true,
    getFieldError: (field) => {
      const error = fields[field]?.error;
      return error === undefined ? undefined : new Error(error);
    },
    getError: () =>
      node.error === undefined ? undefined : fakeTree({ type: "error", data: node.error }),
    hasData: () => node.data !== undefined,
    getDataAsString: () => (typeof node.data === "string" ? node.data : JSON.stringify(node.data)),
    getDataAsJson: <T>() => node.data as T | undefined,
  };
  accessors.set(node, accessor);
  return accessor;
}

/** A PFrame whose columns `name` get healthy `.spec` / `.data` fields unless overridden. */
export function fakePFrame(
  columns: Readonly<Record<string, { spec?: FakeField; data?: FakeField }>>,
): FakeNode {
  const fields: Record<string, FakeField> = {};
  for (const [name, { spec, data }] of Object.entries(columns)) {
    fields[`${name}.spec`] = spec ?? { value: { type: "json", data: { kind: "PColumn", name } } };
    fields[`${name}.data`] = data ?? { value: { type: "blob" } };
  }
  return { type: "PFrame", fields };
}

//
// Internals
//

const accessors = new WeakMap<FakeNode, FakeAccessor>();
