import { describe, expect, test } from "vitest";
import type { PColumnSpec, PObjectSpec } from "../pool";
import { ResourceTypeName } from "../resource_types";
import { listColumnNames } from "./accessor_traversal";
import type { AccessorLike, FieldTraversalStepLike } from "./types";

class StubAccessor implements AccessorLike<StubAccessor> {
  readonly resourceType: { readonly name: string };
  readonly #fields: Record<string, StubAccessor>;
  readonly #data: unknown;

  constructor(typeName: string, fields: Record<string, StubAccessor> = {}, data?: unknown) {
    this.resourceType = { name: typeName };
    this.#fields = fields;
    this.#data = data;
  }

  traverse(step: FieldTraversalStepLike): StubAccessor | undefined {
    return this.#fields[step.field];
  }

  listInputFields(): string[] {
    return Object.keys(this.#fields);
  }

  getInputsLocked(): boolean {
    return true;
  }

  hasData(): boolean {
    return this.#data !== undefined;
  }

  getDataAsJson<T = unknown>(): T | undefined {
    return this.#data as T | undefined;
  }
}

const columnSpec: PColumnSpec = { kind: "PColumn", name: "column", valueType: "Int", axesSpec: [] };
const fileSpec: PObjectSpec = { kind: "File", name: "library" };

describe("listColumnNames", () => {
  test("skips a resolved non-column export and keeps an unresolved spec", () => {
    const pframe = new StubAccessor(ResourceTypeName.PFrame, {
      "column.spec": new StubAccessor("json", {}, columnSpec),
      "column.data": new StubAccessor("json"),
      "library.spec": new StubAccessor("json", {}, fileSpec),
      "library.data": new StubAccessor("json"),
      "pending.spec": new StubAccessor("json"),
    });
    expect(listColumnNames(pframe)).toEqual(["column", "pending"]);
  });
});
