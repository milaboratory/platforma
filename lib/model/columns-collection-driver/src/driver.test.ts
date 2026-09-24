import { describe, expect, test } from "vitest";
import {
  createLocalPObjectId,
  type AccessorHandle,
  type AccessorLike,
  type ColumnsCollectionDriverHost,
  type ColumnsSourceError,
  type FieldTraversalStepLike,
} from "@milaboratories/pl-model-common";
import { ColumnsCollectionDriverImpl } from "./driver";

describe("errored columns in a collection", () => {
  test("a column with an errored spec is left out of getColumns and reported", () => {
    const { driver, host } = driverOver(
      pframe({
        ok: {},
        badSpec: { spec: { error: "bad spec" } },
        badData: { data: { error: "OOM" } },
      }),
    );

    const handle = driver.create([{ kind: "accessor", accessor: ROOT, path: ["main"] }], host).key;

    expect(driver.getColumns(handle, host)).toEqual([idOf("ok"), idOf("badData")]);
    expect(driver.getErrors(handle)).toEqual([
      { kind: "column", id: idOf("badSpec"), field: "spec", message: "bad spec" },
      { kind: "column", id: idOf("badData"), field: "data", message: "OOM" },
    ]);
  });

  test("an errored subtree is reported with its path", () => {
    const { driver, host } = driverOver({
      type: "StdMap",
      fields: { broken: { error: "step ran out of memory" } },
    });

    const handle = driver.create([{ kind: "accessor", accessor: ROOT, path: ["main"] }], host).key;

    expect(driver.getColumns(handle, host)).toEqual([]);
    expect(driver.getErrors(handle)).toEqual([
      { kind: "source", path: ["main", "broken"], message: "step ran out of memory" },
    ]);
  });

  test("an errors source adds no columns and is final", () => {
    const { driver, host } = driverOver(pframe({}));

    const handle = driver.create([{ kind: "errors", errors: [STAGING_ERROR] }], host).key;

    expect(driver.isEmpty(handle)).toBe(true);
    expect(driver.isFinal(handle)).toBe(true);
    expect(driver.getErrors(handle)).toEqual([STAGING_ERROR]);
  });

  test("errors carry over into a collection built from another one", () => {
    const { driver, host } = driverOver(pframe({}));
    const inner = driver.create([{ kind: "errors", errors: [STAGING_ERROR] }], host).key;

    const outer = driver.create([{ kind: "collection", handle: inner }], host).key;

    expect(driver.getErrors(outer)).toEqual([STAGING_ERROR]);
  });

  test("errors carry over through filter", () => {
    const { driver, host } = driverOver(pframe({}));
    const source = driver.create([{ kind: "errors", errors: [STAGING_ERROR] }], host).key;

    const filtered = driver.filter(source, {}, host).key;

    expect(driver.getErrors(filtered)).toEqual([STAGING_ERROR]);
  });
});

//
// Internals
//

const ROOT = "root" as AccessorHandle;

const STAGING_ERROR: ColumnsSourceError = {
  kind: "source",
  path: ["staging"],
  message: "staging output failed",
};

function idOf(name: string) {
  return createLocalPObjectId(["main"], name);
}

function driverOver(root: FakeNode) {
  const driver = new ColumnsCollectionDriverImpl<FakeAccessor>();
  const host: ColumnsCollectionDriverHost<FakeAccessor> = {
    resolveAccessor: () => fakeTree(root),
    getUpstreamBlockCtxes: () => [],
    getSpecDriver: () => {
      throw new Error("no spec driver in this test");
    },
    resolveSpec: () => undefined,
  };
  return { driver, host };
}

type FakeNode = {
  readonly type: string;
  readonly fields?: Readonly<Record<string, FakeField>>;
  readonly data?: unknown;
};

type FakeField = { readonly value?: FakeNode; readonly error?: string };

interface FakeAccessor extends AccessorLike<FakeAccessor> {}

/** A PFrame whose columns get healthy `.spec` / `.data` fields unless overridden. */
function pframe(columns: Record<string, { spec?: FakeField; data?: FakeField }>): FakeNode {
  const fields: Record<string, FakeField> = {};
  for (const [name, { spec, data }] of Object.entries(columns)) {
    fields[`${name}.spec`] = spec ?? { value: { type: "json", data: { kind: "PColumn", name } } };
    fields[`${name}.data`] = data ?? { value: { type: "blob" } };
  }
  return { type: "PFrame", fields };
}

/** Like the host, traversing a field that has an error and no value throws that error. */
function fakeTree(node: FakeNode): FakeAccessor {
  const fields = node.fields ?? {};
  return {
    resourceType: { name: node.type },
    traverse: ({ field }: FieldTraversalStepLike) => {
      const entry = fields[field];
      if (entry?.value === undefined && entry?.error !== undefined) throw new Error(entry.error);
      return entry?.value === undefined ? undefined : fakeTree(entry.value);
    },
    listInputFields: () => Object.keys(fields),
    getInputsLocked: () => true,
    getFieldError: (field) => {
      const error = fields[field]?.error;
      return error === undefined ? undefined : new Error(error);
    },
    hasData: () => node.data !== undefined,
    getDataAsJson: <T>() => node.data as T | undefined,
  };
}
