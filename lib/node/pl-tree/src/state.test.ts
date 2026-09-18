import { expect, test } from "vitest";
import { Computable } from "@milaboratories/computable";
import type { Watcher } from "@milaboratories/computable";
import type { FieldData } from "@milaboratories/pl-client";
import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
  NullSignedResourceId,
} from "@milaboratories/pl-client";
import { isPlTreeEntry, isPlTreeEntryAccessor, isPlTreeNodeAccessor } from "./accessors";
import { PlTreeState } from "./state";
import {
  dField,
  iField,
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
