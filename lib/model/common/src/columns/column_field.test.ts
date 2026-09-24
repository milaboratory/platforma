import { describe, expect, test } from "vitest";
import { readColumnField } from "./column_field";
import type { AccessorLike, FieldTraversalStepLike } from "./types";

describe("readColumnField", () => {
  test("a field with a value reads as present", () => {
    const value = fakeAccessor();
    const pframe = fakeAccessor({ fields: { "col.data": { value } } });

    expect(readColumnField(pframe, "col.data")).toEqual({ status: "present", node: value });
  });

  test("a field with an error and no value reads as errored", () => {
    const error = new Error("OOM");
    const pframe = fakeAccessor({ fields: { "col.data": { error } } });

    expect(readColumnField(pframe, "col.data")).toEqual({ status: "errored", error });
  });

  test("a field with an error and a value reads as errored", () => {
    const error = new Error("OOM");
    const pframe = fakeAccessor({ fields: { "col.data": { value: fakeAccessor(), error } } });

    expect(readColumnField(pframe, "col.data")).toEqual({ status: "errored", error });
  });

  test("a field without a value yet reads as resolving", () => {
    const pframe = fakeAccessor({ fields: { "col.data": {} } });

    expect(readColumnField(pframe, "col.data")).toEqual({ status: "resolving" });
  });

  test("a missing field reads as resolving while inputs are open", () => {
    const pframe = fakeAccessor({ inputsLocked: false });

    expect(readColumnField(pframe, "col.data")).toEqual({ status: "resolving" });
  });

  test("a missing field reads as absent once inputs are locked", () => {
    const pframe = fakeAccessor({ inputsLocked: true });

    expect(readColumnField(pframe, "col.data")).toEqual({ status: "absent" });
  });
});

//
// Internals
//

type FakeField = { readonly value?: FakeAccessor; readonly error?: Error };

interface FakeAccessor extends AccessorLike<FakeAccessor> {}

/**
 * An accessor over `fields`. Like the host, traversing a field that has an
 * error and no value throws that error.
 */
function fakeAccessor({
  fields = {},
  inputsLocked = true,
}: {
  fields?: Record<string, FakeField>;
  inputsLocked?: boolean;
} = {}): FakeAccessor {
  return {
    resourceType: { name: "PFrame" },
    traverse: ({ field }: FieldTraversalStepLike) => {
      const entry = fields[field];
      if (entry?.value === undefined && entry?.error !== undefined) throw entry.error;
      return entry?.value;
    },
    listInputFields: () => Object.keys(fields),
    getInputsLocked: () => inputsLocked,
    getFieldError: (field) => fields[field]?.error,
    hasData: () => false,
    getDataAsJson: () => undefined,
  };
}
