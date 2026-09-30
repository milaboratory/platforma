import { describe, expect, test } from "vitest";
import { Computable } from "@milaboratories/computable";
import type { Watcher } from "@milaboratories/computable";
import type { FieldData } from "@milaboratories/pl-client";
import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
  NullSignedResourceId,
} from "@milaboratories/pl-client";
import { isPlTreeEntry, isPlTreeEntryAccessor, isPlTreeNodeAccessor } from "./accessors";
import type { ExtendedResourceData } from "./state";
import { PlTreeState, TreeStateUpdateError } from "./state";
import { constructTreeLoadingRequest, initialTreeLoadingStat } from "./sync";
import {
  dField,
  field,
  iField,
  InitialStructuralResourceState,
  ResourceReady,
  TestDynamicRootId1,
  TestDynamicRootState1,
  TestErrorResourceState2,
  TestStructuralResourceState1,
  TestValueResourceState1,
} from "./test_utils";

const rid = createSignedResourceId;

/** Minimal Watcher for tests that read tree state directly, outside a Computable. */
class NoopWatcher implements Watcher {
  isChanged = false;
  markChanged(): void {
    this.isChanged = true;
  }
}
const w = () => new NoopWatcher();

test("simple tree test 1", async () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  const entry = tree.entry();
  expect(isPlTreeEntry(entry)).toStrictEqual(true);
  const c1 = Computable.make((c) => {
    const eAcc = c.accessor(entry);
    expect(isPlTreeEntryAccessor(eAcc)).toStrictEqual(true);
    const nAcc = eAcc.node();
    expect(isPlTreeNodeAccessor(nAcc)).toStrictEqual(true);
    return nAcc.traverse("a", "b")?.getDataAsString();
  });

  expect(c1.isChanged()).toBeTruthy();
  await expect(async () => await c1.getValue()).rejects.toThrow(/not found/);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestDynamicRootState1, fields: [] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestDynamicRootState1, fields: [dField("b")] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestDynamicRootState1, fields: [dField("b"), dField("a")] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField("b"), dField("a", rid(1n))] },
    { ...TestStructuralResourceState1, id: rid(1n), fields: [iField("b", rid(2n))] },
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode("Test1"),
    },
  ]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toStrictEqual("Test1");
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestDynamicRootState1, fields: [dField("a")] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();
});

test("simple tree kv test", async () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  const c1 = Computable.make((c) =>
    c.accessor(tree.entry()).node().traverse("a", "b")?.getKeyValueAsString("thekey"),
  );

  expect(JSON.stringify(tree.entry())).toMatch(/^"\[ENTRY:/);

  expect(c1.isChanged()).toBeTruthy();
  await expect(async () => await c1.getValue()).rejects.toThrow(/not found/);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField("b"), dField("a", rid(1n))] },
    { ...TestStructuralResourceState1, id: rid(1n), fields: [iField("b", rid(2n))] },
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode("Test1"),
    },
  ]);

  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode("Test1"),
      kv: [{ key: "thekey", value: Buffer.from("thevalue") }],
    },
  ]);

  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toEqual("thevalue");
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode("Test1"),
      kv: [],
    },
  ]);

  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();
});

test("partial tree update", async () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  const c1 = Computable.make((c) =>
    c
      .accessor(tree.entry())
      .node()
      .traverse(
        { field: "a", assertFieldType: "Dynamic" },
        { field: "b", assertFieldType: "Dynamic" },
      )
      ?.getDataAsString(),
  );

  expect(c1.isChanged()).toBeTruthy();
  await expect(async () => await c1.getValue()).rejects.toThrow(/not found/);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField("b"), dField("a", rid(1n))] },
    { ...TestStructuralResourceState1, id: rid(1n), fields: [dField("b", rid(2n))] },
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode("Test1"),
    },
  ]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toStrictEqual("Test1");
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([{ ...TestStructuralResourceState1, id: rid(1n), fields: [] }]);
  expect(c1.isChanged()).toBeTruthy();
  expect(await c1.getValue()).toBeUndefined();
  expect(c1.isChanged()).toBeFalsy();
});

test("resource error", async () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  const c1 = Computable.make((c) =>
    c.accessor(tree.entry()).node().traverse("a", "b")?.getKeyValueAsString("thekey"),
  );

  expect(c1.isChanged()).toBeTruthy();
  await expect(async () => await c1.getValue()).rejects.toThrow(/not found/);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, error: rid(7n), fields: [] },
    {
      ...TestErrorResourceState2,
      id: rid(7n),
      data: Buffer.from('"error"'),
      fields: [],
    },
  ]);

  expect((await c1.getValueOrError()).type).toEqual("error");
});

test("field error", async () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  const c1 = Computable.make((c) =>
    c.accessor(tree.entry()).node().traverse("b", "a")?.getKeyValueAsString("thekey"),
  );

  expect(c1.isChanged()).toBeTruthy();
  await expect(async () => await c1.getValue()).rejects.toThrow(/not found/);
  expect(c1.isChanged()).toBeFalsy();

  tree.updateFromResourceData([
    {
      ...TestDynamicRootState1,
      fields: [dField("b", NullSignedResourceId, rid(7n))],
    },
    {
      ...TestErrorResourceState2,
      id: rid(7n),
      data: Buffer.from('"error"'),
      fields: [],
    },
  ]);

  expect((await c1.getValueOrError()).type).toEqual("error");
});

test("exception - deletion of input field", () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField("b"), dField("a", rid(1n))] },
    { ...TestStructuralResourceState1, id: rid(1n), fields: [iField("b", rid(2n))] },
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode("Test1"),
    },
  ]);

  expect(() =>
    tree.updateFromResourceData([{ ...TestStructuralResourceState1, id: rid(1n), fields: [] }]),
  ).toThrow(/removal of Input field/);
});

test("exception - addition of input field", () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField("b"), dField("a", rid(1n))] },
    {
      ...TestStructuralResourceState1,
      id: rid(1n),
      fields: [iField("b", rid(2n))],
      ...ResourceReady,
    },
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode("Test1"),
    },
  ]);

  expect(() =>
    tree.updateFromResourceData([
      {
        ...TestStructuralResourceState1,
        id: rid(1n),
        fields: [iField("b", rid(2n)), iField("df")],
        ...ResourceReady,
      },
    ]),
  ).toThrow(/adding Input/);
});

test("exception - ready without locks 1", () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);

  expect(() =>
    tree.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        fields: [dField("b"), dField("a", rid(1n))],
      },
      {
        ...TestStructuralResourceState1,
        id: rid(1n),
        fields: [iField("b", rid(2n))],
        resourceReady: true,
      },
      {
        ...TestValueResourceState1,
        id: rid(2n),
        data: new TextEncoder().encode("Test1"),
      },
    ]),
  ).toThrow(/ready without input or output lock/);
});

test("exception - ready without locks 2", () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);

  tree.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField("b"), dField("a", rid(1n))] },
    {
      ...TestStructuralResourceState1,
      id: rid(1n),
      fields: [iField("b", rid(2n))],
    },
    {
      ...TestValueResourceState1,
      id: rid(2n),
      data: new TextEncoder().encode("Test1"),
    },
  ]);

  expect(() =>
    tree.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        fields: [dField("b"), dField("a", rid(1n))],
      },
      {
        ...TestStructuralResourceState1,
        id: rid(1n),
        fields: [iField("b", rid(2n))],
        resourceReady: true,
      },
      {
        ...TestValueResourceState1,
        id: rid(2n),
        data: new TextEncoder().encode("Test1"),
      },
    ]),
  ).toThrow(/ready without input or output lock/);
});

// The field and kv update loops walk the stored entries in lockstep with the incoming ones
// and only fall back to a hash lookup once the two orders diverge. These cover the
// divergence shapes: reordering, an insertion in the middle, a removal. A reorder that
// changes nothing must invalidate nothing and must not disturb refCounts, which is what
// pins the fallback: mistaking a reordered field for a new one still leaves the right field
// set behind, but double-counts the reference and fires spurious change notifications.

const rootRes = (fields: FieldData[]) => [{ ...TestDynamicRootState1, fields }];

test("a pure field reorder changes nothing and invalidates nothing", () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  tree.updateFromResourceData(rootRes([dField("a"), dField("b"), dField("c")]));

  const watcher = w();
  const root = tree.get(watcher, TestDynamicRootId1);
  root.listDynamicFields(watcher);
  for (const name of ["a", "b", "c"]) root.getField(watcher, name, () => {});
  expect(watcher.isChanged).toStrictEqual(false);

  tree.updateFromResourceData(rootRes([dField("c"), dField("b"), dField("a")]));

  expect(watcher.isChanged).toStrictEqual(false);
  expect(
    tree
      .get(w(), TestDynamicRootId1)
      .fields.map((f) => f.name)
      .sort(),
  ).toStrictEqual(["a", "b", "c"]);
});

test("field inserted mid-order, then removed, is tracked", () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  const names = () =>
    tree
      .get(w(), TestDynamicRootId1)
      .fields.map((f) => f.name)
      .sort();

  tree.updateFromResourceData(rootRes([dField("a"), dField("c")]));
  expect(names()).toStrictEqual(["a", "c"]);

  // "b" appears between two fields that are already stored: the walk diverges at "b"
  tree.updateFromResourceData(rootRes([dField("a"), dField("b"), dField("c")]));
  expect(names()).toStrictEqual(["a", "b", "c"]);

  // and disappears again, in a shuffled order
  tree.updateFromResourceData(rootRes([dField("c"), dField("a")]));
  expect(names()).toStrictEqual(["a", "c"]);
});

test("reordering fields does not inflate refCounts", () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  const leaf = (n: bigint) => ({
    ...TestValueResourceState1,
    id: rid(n),
    data: new TextEncoder().encode(`v${n}`),
  });

  tree.updateFromResourceData([
    {
      ...TestDynamicRootState1,
      fields: [dField("a", rid(1n)), dField("b", rid(2n))],
    },
    leaf(1n),
    leaf(2n),
  ]);

  // reorder and repoint in one update: the two fields swap targets
  tree.updateFromResourceData([
    {
      ...TestDynamicRootState1,
      fields: [dField("b", rid(1n)), dField("a", rid(2n))],
    },
    leaf(1n),
    leaf(2n),
  ]);

  const byName = new Map(tree.get(w(), TestDynamicRootId1).fields.map((f) => [f.name, f.value]));
  expect(byName.get("a")).toStrictEqual(rid(2n));
  expect(byName.get("b")).toStrictEqual(rid(1n));

  // dropping "a" must collect leaf 2: its refCount has to be exactly 1, so a reorder that
  // was mistaken for an insertion (and double-incremented) would leave it alive here
  tree.updateFromResourceData(rootRes([dField("b", rid(1n))]));
  expect(tree.get(w(), rid(1n)).getDataAsString()).toStrictEqual("v1");
  expect(() => tree.get(w(), rid(2n))).toThrow(/not found/);
});

test("kv reordering neither invalidates watchers nor loses entries", () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  const kvOf = (entries: [string, string][]) => [
    {
      ...TestDynamicRootState1,
      fields: [],
      kv: entries.map(([key, value]) => ({ key, value: Buffer.from(value) })),
    },
  ];
  const read = (key: string) => tree.get(w(), TestDynamicRootId1).getKeyValueString(w(), key);

  tree.updateFromResourceData(
    kvOf([
      ["k1", "one"],
      ["k2", "two"],
    ]),
  );
  expect([read("k1"), read("k2")]).toStrictEqual(["one", "two"]);

  // reversed order, same values: no watcher may fire
  const watcher = w();
  const root = tree.get(watcher, TestDynamicRootId1);
  root.getKeyValue(watcher, "k1");
  root.getKeyValue(watcher, "k2");
  tree.updateFromResourceData(
    kvOf([
      ["k2", "two"],
      ["k1", "one"],
    ]),
  );
  expect(watcher.isChanged).toStrictEqual(false);

  // a key inserted before the stored ones, so the walk diverges immediately
  tree.updateFromResourceData(
    kvOf([
      ["k0", "zero"],
      ["k2", "two"],
      ["k1", "ONE"],
    ]),
  );
  expect([read("k0"), read("k1"), read("k2")]).toStrictEqual(["zero", "ONE", "two"]);

  // and a deletion
  tree.updateFromResourceData(kvOf([["k1", "ONE"]]));
  expect([read("k0"), read("k1"), read("k2")]).toStrictEqual([undefined, "ONE", undefined]);
});

test("removal of a typed field still throws after a reorder", () => {
  const tree = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);

  tree.updateFromResourceData(rootRes([iField("a"), iField("b"), dField("c")]));

  // reordered, and the input field "b" is gone: the removal scan must still see it
  expect(() => tree.updateFromResourceData(rootRes([dField("c"), iField("a")]))).toThrow(
    /removal of Input field b/,
  );
});

//
// Regression tests for the v1 tree defects (B1, B2, B4, B8-B12). Each one failed on the code
// before its fix.
//

const R1 = rid(10n);
const V1 = rid(20n);

function res(
  id: ReturnType<typeof rid>,
  typeName: string,
  patch: Partial<ExtendedResourceData> = {},
  fields: FieldData[] = [],
): ExtendedResourceData {
  return {
    ...InitialStructuralResourceState,
    id,
    type: { name: typeName, version: "1" },
    fields,
    ...patch,
  };
}

/** A tree whose root holds R1 through a dynamic field, R1 built from `r1`. */
function treeWith(r1: ExtendedResourceData, ...others: ExtendedResourceData[]): PlTreeState {
  const t = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  t.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField("a", R1)] },
    ...others,
    r1,
  ]);
  return t;
}

describe("B1: becoming final notifies the readers of every source it retires", () => {
  test("a missing-field reader is re-run when the resource becomes final", () => {
    const t = treeWith(res(R1, "StdMap", { inputsLocked: true }));
    const reader = w();
    const unstable: string[] = [];
    expect(t.get(w(), R1).getField(reader, "x", (m) => unstable.push(m))).toBeUndefined();
    expect(unstable).toEqual(["field_not_found:x"]);

    // ready makes a StdMap final; the field list itself does not change
    t.updateFromResourceData([res(R1, "StdMap", { inputsLocked: true, resourceReady: true })]);
    expect(t.get(w(), R1).finalState).toBe(true);
    expect(reader.isChanged).toBe(true);

    // and the re-run now reads a stable absence
    const rerun: string[] = [];
    expect(t.get(w(), R1).getField(w(), "x", (m) => rerun.push(m))).toBeUndefined();
    expect(rerun).toEqual([]);
  });

  test("a KV reader of an absent key is re-run when the resource becomes final", () => {
    const t = treeWith(res(R1, "StdMap", { inputsLocked: true }));
    const reader = w();
    expect(t.get(w(), R1).getKeyValue(reader, "k")).toBeUndefined();
    t.updateFromResourceData([res(R1, "StdMap", { inputsLocked: true, resourceReady: true })]);
    expect(reader.isChanged).toBe(true);
  });
});

describe("B2: any error inside the apply invalidates the tree as a TreeStateUpdateError", () => {
  test("a throwing final predicate", () => {
    const A = rid(30n);
    const B = rid(31n);
    const C = rid(32n);
    const S = rid(33n);
    const t = new PlTreeState(TestDynamicRootId1, (r) => {
      if (r.type.name === "Boom") throw new Error("predicate failure");
      return DefaultFinalResourceDataPredicate(r);
    });
    t.updateFromResourceData([
      { ...TestDynamicRootState1, fields: [dField("a", A)] },
      res(A, "UserProject", {}, [dField("f", B)]),
      res(B, "UserProject"),
    ]);
    const reader = w();
    t.get(reader, B);
    // A is repointed B -> C, then the predicate throws a plain Error on S.
    expect(() =>
      t.updateFromResourceData(
        [res(A, "UserProject", {}, [dField("f", C)]), res(C, "UserProject"), res(S, "Boom")],
        { allowOrphanInputs: true },
      ),
    ).toThrow(TreeStateUpdateError);
    expect(t.isValid).toBe(false);
    expect(reader.isChanged).toBe(true);
  });

  test("the original error is kept as the cause", () => {
    const t = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
    let thrown: unknown;
    try {
      // ready with inputs unlocked: verifyReadyState throws a plain Error
      t.updateFromResourceData([{ ...TestDynamicRootState1, inputsLocked: false, fields: [] }]);
    } catch (e: unknown) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(TreeStateUpdateError);
    expect(thrown instanceof Error && thrown.cause instanceof Error).toBe(true);
    expect(t.isValid).toBe(false);
  });
});

describe("B4: lock transitions notify lock readers", () => {
  test("inputs", () => {
    const t = treeWith(res(R1, "UserProject"));
    const reader = w();
    expect(t.get(w(), R1).getInputsLocked(reader)).toBe(false);
    t.updateFromResourceData([res(R1, "UserProject", { inputsLocked: true })]);
    expect(reader.isChanged).toBe(true);
  });

  test("outputs", () => {
    const t = treeWith(res(R1, "UserProject", { inputsLocked: true, resourceReady: true }));
    const reader = w();
    expect(t.get(w(), R1).getOutputsLocked(reader)).toBe(false);
    t.updateFromResourceData([
      res(R1, "UserProject", { inputsLocked: true, resourceReady: true, outputsLocked: true }),
    ]);
    expect(reader.isChanged).toBe(true);
  });

  test("a lock alone does not notify a ready reader", () => {
    const t = treeWith(res(R1, "UserProject"));
    const reader = w();
    expect(t.get(w(), R1).getIsReadyOrError(reader)).toBe(false);
    t.updateFromResourceData([res(R1, "UserProject", { inputsLocked: true })]);
    expect(reader.isChanged).toBe(false);
  });
});

describe("B8: a required-field read recovers when the field appears", () => {
  for (const opt of ["errorIfFieldNotFound", "errorIfFieldNotSet"] as const) {
    test(opt, () => {
      const t = treeWith(res(R1, "UserProject"));
      const reader = w();
      expect(() => t.get(w(), R1).getField(reader, { field: "x", [opt]: true }, () => {})).toThrow(
        /not found/,
      );
      t.updateFromResourceData([res(R1, "UserProject", {}, [dField("x")])]);
      expect(reader.isChanged).toBe(true);
    });
  }
});

describe("B9: a dynamic field removal re-evaluates finality", () => {
  test("the resource becomes final and leaves the seed set", () => {
    const upload = (fields: FieldData[]) =>
      res(
        R1,
        "BlobUpload/x",
        { inputsLocked: true, outputsLocked: true, resourceReady: true },
        fields,
      );
    const output = field("Output", "o", V1, NullSignedResourceId, true);
    const t = treeWith(upload([output, dField("d")]), {
      ...TestValueResourceState1,
      id: V1,
      data: Buffer.from("x"),
    });
    expect(t.get(w(), R1).finalState).toBe(false);

    t.updateFromResourceData([upload([output])]);
    expect(t.get(w(), R1).finalState).toBe(true);
    expect(constructTreeLoadingRequest(t).seedResources).not.toContain(R1);
  });

  test("a removal alone counts as a changed resource", () => {
    const t = treeWith(res(R1, "UserProject", {}, [dField("d")]));
    const stat = initialTreeLoadingStat();
    t.updateFromResourceData([res(R1, "UserProject")], { stat });
    expect(stat.resourcesChanged).toBe(1);
    expect(stat.fieldsRemoved).toBe(1);
  });
});

describe("B10: listDynamicFields lists no Service field", () => {
  test("a Service field is an input field, not a dynamic one", () => {
    const t = treeWith(res(R1, "UserProject"));
    const dynamicReader = w();
    const inputReader = w();
    expect(t.get(w(), R1).listDynamicFields(dynamicReader)).toEqual([]);
    expect(t.get(w(), R1).listInputFields(inputReader)).toEqual([]);

    t.updateFromResourceData([res(R1, "UserProject", {}, [field("Service", "s"), dField("d")])]);
    expect(t.get(w(), R1).listDynamicFields(w())).toEqual(["d"]);
    expect(t.get(w(), R1).listInputFields(w())).toEqual(["s"]);
    expect(inputReader.isChanged).toBe(true);
    expect(dynamicReader.isChanged).toBe(true);
  });
});

describe("B11: a Dynamic or MTW field recreated under another type", () => {
  for (const from of ["Dynamic", "MTW"] as const) {
    test(`${from} -> Input notifies both lists`, () => {
      const t = treeWith(res(R1, "UserProject", {}, [field(from, "f")]));
      const inputReader = w();
      const dynamicReader = w();
      expect(t.get(w(), R1).listInputFields(inputReader)).toEqual([]);
      expect(t.get(w(), R1).listDynamicFields(dynamicReader)).toEqual(["f"]);

      t.updateFromResourceData([res(R1, "UserProject", {}, [field("Input", "f")])]);
      expect(t.isValid).toBe(true);
      expect(t.get(w(), R1).listInputFields(w())).toEqual(["f"]);
      expect(t.get(w(), R1).listDynamicFields(w())).toEqual([]);
      expect(inputReader.isChanged).toBe(true);
      expect(dynamicReader.isChanged).toBe(true);
    });

    test(`${from} -> Output notifies the output list`, () => {
      const t = treeWith(res(R1, "UserProject", {}, [field(from, "f")]));
      const outputReader = w();
      expect(t.get(w(), R1).listOutputFields(outputReader)).toEqual([]);
      t.updateFromResourceData([res(R1, "UserProject", {}, [field("Output", "f")])]);
      expect(t.get(w(), R1).listOutputFields(w())).toEqual(["f"]);
      expect(outputReader.isChanged).toBe(true);
    });
  }

  test("a reader refused on the old type is re-run when the field changes type", () => {
    const t = treeWith(res(R1, "UserProject", {}, [dField("f")]));
    const reader = w();
    expect(() =>
      t.get(w(), R1).getField(reader, { field: "f", assertFieldType: "Output" }, () => {}),
    ).toThrow(/Unexpected field type/);
    t.updateFromResourceData([res(R1, "UserProject", {}, [field("Output", "f")])]);
    expect(reader.isChanged).toBe(true);
  });

  test("MTW -> Dynamic is accepted", () => {
    const t = treeWith(res(R1, "UserProject", {}, [field("MTW", "f")]));
    t.updateFromResourceData([res(R1, "UserProject", {}, [dField("f")])]);
    expect(t.get(w(), R1).fieldsMap.get("f")?.type).toBe("Dynamic");
  });

  test("-> Input while inputs are locked is rejected", () => {
    const t = treeWith(res(R1, "UserProject", { inputsLocked: true }, [dField("f")]));
    expect(() =>
      t.updateFromResourceData([
        res(R1, "UserProject", { inputsLocked: true }, [field("Input", "f")]),
      ]),
    ).toThrow(TreeStateUpdateError);
  });

  test("-> Service while inputs are locked is rejected", () => {
    const t = treeWith(res(R1, "UserProject", { inputsLocked: true }, [dField("f")]));
    expect(() =>
      t.updateFromResourceData([
        res(R1, "UserProject", { inputsLocked: true }, [field("Service", "f")]),
      ]),
    ).toThrow(TreeStateUpdateError);
  });

  test("-> Output while outputs are locked is rejected", () => {
    const locked = { inputsLocked: true, outputsLocked: true, resourceReady: true };
    const t = treeWith(res(R1, "UserProject", locked, [dField("f")]));
    expect(() =>
      t.updateFromResourceData([res(R1, "UserProject", locked, [field("Output", "f")])]),
    ).toThrow(TreeStateUpdateError);
  });

  test("a typed field still cannot change type", () => {
    const t = treeWith(res(R1, "UserProject", {}, [field("Input", "f")]));
    expect(() =>
      t.updateFromResourceData([res(R1, "UserProject", {}, [field("Output", "f")])]),
    ).toThrow(TreeStateUpdateError);
  });
});

describe("B12: the backend final flag follows updates", () => {
  test("copied on update, and counted as a change", () => {
    const t = treeWith(res(R1, "UserProject"));
    const stat = initialTreeLoadingStat();
    t.updateFromResourceData([res(R1, "UserProject", { final: true })], { stat });
    expect(t.get(w(), R1).final).toBe(true);
    expect(stat.resourcesChanged).toBe(1);
  });
});
