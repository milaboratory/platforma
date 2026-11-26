import { describe, expect, it } from "vitest";
import type { PObjectId } from "../pool";
import { readLeafData } from "./leaf_data";
import type { AccessorLike, FieldLike, FieldTraversalStepLike, LeafEntry } from "./types";

describe("readLeafData", () => {
  it("gives the data resource of a field with a value", () => {
    const data = new FakeNode("data");

    expect(readLeafData(leaf({ "col.data": { value: data } }))).toEqual({
      type: "resource",
      resource: data,
    });
  });

  it("reads a field without a value as unset", () => {
    expect(readLeafData(leaf({ "col.data": {} }))).toEqual({ type: "unset" });
  });

  it("reads a missing field as unset", () => {
    expect(readLeafData(leaf({}))).toEqual({ type: "unset" });
  });

  it("reads a field with an error and no value as errored", () => {
    const error = new FakeNode("error");

    expect(readLeafData(leaf({ "col.data": { error } }))).toEqual({ type: "errored", error });
  });

  it("reads a field with an error and a value as errored", () => {
    const error = new FakeNode("error");

    expect(readLeafData(leaf({ "col.data": { value: new FakeNode("data"), error } }))).toEqual({
      type: "errored",
      error,
    });
  });

  it("reads the data field of the column as an input", () => {
    const frame = new FakeNode("frame", { "col.data": {} });

    readLeafData({ accessor: frame, name: "col", id: "col" as PObjectId });

    expect(frame.steps).toEqual([{ field: "col.data", assertFieldType: "Input" }]);
  });
});

//
// Internals
//

class FakeNode implements AccessorLike<FakeNode> {
  readonly steps: FieldTraversalStepLike[] = [];

  constructor(
    readonly label: string,
    private readonly fields: Record<string, FieldLike<FakeNode>> = {},
  ) {}

  get resourceType() {
    return { name: this.label };
  }

  traverse(step: FieldTraversalStepLike): FakeNode | undefined {
    return this.fields[step.field]?.value;
  }

  getField(step: FieldTraversalStepLike): FieldLike<FakeNode> | undefined {
    this.steps.push(step);
    return this.fields[step.field];
  }

  listInputFields(): string[] {
    return Object.keys(this.fields);
  }

  getInputsLocked(): boolean {
    return true;
  }

  hasData(): boolean {
    return false;
  }

  getDataAsJson<T = unknown>(): T | undefined {
    return undefined;
  }
}

function leaf(fields: Record<string, FieldLike<FakeNode>>): LeafEntry<FakeNode> {
  return { accessor: new FakeNode("frame", fields), name: "col", id: "col" as PObjectId };
}
