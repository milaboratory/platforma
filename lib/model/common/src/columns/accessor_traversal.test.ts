import { describe, expect, test } from "vitest";
import { createLocalPObjectId } from "../pool";
import { ResourceTypeName } from "../resource_types";
import { indexAccessorRoot } from "./accessor_traversal";
import type { AccessorLike, FieldTraversalStepLike } from "./types";

/** A field that has an error and no value. */
const ERRORED = "errored";

type StubNode = {
  readonly typeName: string;
  readonly fields?: Readonly<Record<string, StubNode | typeof ERRORED>>;
};

/** Follows `PlTreeNodeAccessor.traverse`: an errored field throws unless the step sets `pureFieldErrorToUndefined`. */
class StubAccessor implements AccessorLike<StubAccessor> {
  readonly steps: FieldTraversalStepLike[] = [];

  constructor(private readonly node: StubNode) {}

  get resourceType() {
    return { name: this.node.typeName };
  }

  traverse(step: FieldTraversalStepLike): StubAccessor | undefined {
    this.steps.push(step);
    const child = this.node.fields?.[step.field];
    if (child === ERRORED) {
      if (step.pureFieldErrorToUndefined === true) return undefined;
      throw new Error(`"${step.field}": has input errors: OOM`);
    }
    return child === undefined ? undefined : new StubAccessor(child);
  }

  listInputFields(): string[] {
    return Object.keys(this.node.fields ?? {});
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

const pframe = (...columns: string[]): StubNode => ({
  typeName: ResourceTypeName.PFrame,
  fields: Object.fromEntries(
    columns.flatMap((name) => [
      [`${name}.spec`, { typeName: "json" }],
      [`${name}.data`, { typeName: "json" }],
    ]),
  ),
});

describe("indexAccessorRoot", () => {
  test("collects columns from nested maps with their paths", () => {
    const root = new StubAccessor({
      typeName: ResourceTypeName.StdMap,
      fields: {
        a: pframe("x"),
        b: { typeName: ResourceTypeName.StdMap, fields: { c: pframe("y") } },
      },
    });
    const ids = indexAccessorRoot(root, ["main"]).map((e) => e.id);
    expect(ids.sort()).toEqual(
      [
        createLocalPObjectId(["main", "a"], "x"),
        createLocalPObjectId(["main", "b", "c"], "y"),
      ].sort(),
    );
  });

  test("skips a field that has an error and no value, and keeps the other columns", () => {
    const root = new StubAccessor({
      typeName: ResourceTypeName.StdMap,
      fields: { results: ERRORED, table: pframe("x") },
    });
    const entries = indexAccessorRoot(root, ["main"]);
    expect(entries.map((e) => e.id)).toEqual([createLocalPObjectId(["main", "table"], "x")]);
    expect(root.steps.every((step) => step.pureFieldErrorToUndefined === true)).toBe(true);
  });
});
