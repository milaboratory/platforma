import { describe, expect, test } from "vitest";
import { createLocalPObjectId } from "../pool";
import { ResourceTypeName } from "../resource_types";
import { indexAccessorRoot, listColumnNames } from "./accessor_traversal";
import type { AccessorLike, FieldTraversalStepLike } from "./types";

type StubField = {
  readonly value?: StubNode;
  readonly error?: true;
};

type StubNode = {
  readonly typeName: string;
  readonly error?: true;
  readonly fields?: Readonly<Record<string, StubField>>;
};

/**
 * Accessor over a locked, fully resolved tree. Traversal follows the host:
 * an absent input field throws, a field with an error and no value throws
 * unless the step sets `pureFieldErrorToUndefined`, and a field with an error
 * and a value throws unless the step sets `ignoreError`.
 */
class StubAccessor implements AccessorLike<StubAccessor> {
  readonly traversed: string[] = [];

  constructor(private readonly node: StubNode) {}

  get resourceType(): { readonly name: string } {
    return { name: this.node.typeName };
  }

  traverse(step: FieldTraversalStepLike): StubAccessor | undefined {
    this.traversed.push(step.field);
    const field = this.node.fields?.[step.field];
    if (field === undefined) throw new Error(`Service or input field not found ${step.field}.`);
    if (field.error === true) {
      if (field.value === undefined) {
        if (step.pureFieldErrorToUndefined === true) return undefined;
        throw new Error(`"${step.field}": has input errors`);
      }
      if (step.ignoreError !== true) throw new Error(`"${step.field}": has input errors`);
    }
    return field.value === undefined ? undefined : new StubAccessor(field.value);
  }

  listInputFields(): string[] {
    return Object.keys(this.node.fields ?? {});
  }

  getInputsLocked(): boolean {
    return true;
  }

  getError(): StubAccessor | undefined {
    return this.node.error === true ? new StubAccessor({ typeName: "json" }) : undefined;
  }

  hasData(): boolean {
    return false;
  }

  getDataAsJson<T = unknown>(): T | undefined {
    return undefined;
  }
}

const healthy: StubField = { value: { typeName: "json" } };
const errorWithoutValue: StubField = { error: true };
const errorWithValue: StubField = { value: { typeName: "json", error: true }, error: true };

function pframe(fields: Record<string, StubField>, error?: true): StubNode {
  return { typeName: ResourceTypeName.PFrame, fields, error };
}

describe("listColumnNames", () => {
  test("lists every column of a healthy PFrame without reading its fields", () => {
    const frame = new StubAccessor(
      pframe({ "a.spec": healthy, "a.data": errorWithoutValue, "b.spec": healthy }),
    );

    expect(listColumnNames(frame)).toEqual(["a", "b"]);
    expect(frame.traversed).toEqual([]);
  });

  test("leaves out a column whose data has an error and no value", () => {
    const frame = new StubAccessor(
      pframe(
        { "a.spec": healthy, "a.data": errorWithoutValue, "b.spec": healthy, "b.data": healthy },
        true,
      ),
    );

    expect(listColumnNames(frame)).toEqual(["b"]);
  });

  test("leaves out a column whose data resource is in error", () => {
    const frame = new StubAccessor(
      pframe(
        { "a.spec": healthy, "a.data": errorWithValue, "b.spec": healthy, "b.data": healthy },
        true,
      ),
    );

    expect(listColumnNames(frame)).toEqual(["b"]);
  });

  test("leaves out a column whose spec has an error", () => {
    const frame = new StubAccessor(
      pframe(
        { "a.spec": errorWithoutValue, "a.data": healthy, "b.spec": healthy, "b.data": healthy },
        true,
      ),
    );

    expect(listColumnNames(frame)).toEqual(["b"]);
  });

  test("keeps a column that has no data field on an errored PFrame", () => {
    const frame = new StubAccessor(
      pframe({ "a.spec": healthy, "b.spec": healthy, "b.data": errorWithoutValue }, true),
    );

    expect(listColumnNames(frame)).toEqual(["a"]);
  });
});

describe("indexAccessorRoot", () => {
  test("collects columns from nested maps with their paths", () => {
    const root = new StubAccessor({
      typeName: ResourceTypeName.StdMap,
      fields: {
        a: { value: pframe({ "x.spec": healthy, "x.data": healthy }) },
        b: {
          value: {
            typeName: ResourceTypeName.StdMap,
            fields: { c: { value: pframe({ "y.spec": healthy, "y.data": healthy }) } },
          },
        },
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

  test("skips an errored field and keeps the healthy columns under an errored root", () => {
    const root = new StubAccessor({
      typeName: ResourceTypeName.StdMap,
      error: true,
      fields: {
        results: errorWithoutValue,
        table: { value: pframe({ "x.spec": healthy, "x.data": healthy }) },
      },
    });

    const ids = indexAccessorRoot(root, ["main"]).map((e) => e.id);

    expect(ids).toEqual([createLocalPObjectId(["main", "table"], "x")]);
  });
});
