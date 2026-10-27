/**
 * Listing a resource's KV entries and fields without knowing their names in advance, which is what
 * a status-context reader does: a context's transitions arrive under keys it cannot predict.
 */

import { describe, expect, test } from "vitest";
import { Computable } from "@milaboratories/computable";
import { DefaultFinalResourceDataPredicate } from "@milaboratories/pl-client";
import type { PlTreeNodeAccessor } from "./accessors";
import { PlTreeState } from "./state";
import { dField, field, iField, TestDynamicRootId1, TestDynamicRootState1 } from "./test_utils";

const kv = (key: string, value: string) => ({ key, value: Buffer.from(value) });

/** A root with the given KV and fields, open so its field lists can still grow. */
function rootWith(entries: { key: string; value: Buffer }[], fields = [dField("a")]): PlTreeState {
  const t = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  t.updateFromResourceData([
    {
      ...TestDynamicRootState1,
      inputsLocked: false,
      outputsLocked: false,
      resourceReady: false,
      fields,
      kv: entries,
    },
  ]);
  return t;
}

describe("listKeyValues", () => {
  test("returns every entry under the prefix and nothing outside it", async () => {
    const t = rootWith([
      kv("transition/core/1/100", '{"state":"Running"}'),
      kv("transition/exec/2/200", '{"state":"Completed"}'),
      kv("attr/exec/2/progress/42", "40"),
      kv("done", "1"),
    ]);
    const entry = t.entry();

    const transitions = Computable.make((ctx) =>
      ctx.accessor(entry).node().listKeyValuesAsString("transition/"),
    );

    expect(await transitions.getValue()).toEqual([
      { key: "transition/core/1/100", value: '{"state":"Running"}' },
      { key: "transition/exec/2/200", value: '{"state":"Completed"}' },
    ]);
  });

  test("with no prefix returns everything", async () => {
    const t = rootWith([kv("a", "1"), kv("b", "2")]);
    const all = Computable.make((ctx) => ctx.accessor(t.entry()).node().listKeyValues());

    expect((await all.getValue()).map((e) => e.key)).toEqual(["a", "b"]);
  });

  test("re-runs its reader when a key is added under the prefix", async () => {
    const t = rootWith([kv("transition/core/1/100", "first")]);
    const entry = t.entry();
    const c = Computable.make((ctx) =>
      ctx
        .accessor(entry)
        .node()
        .listKeyValuesAsString("transition/")
        .map((e) => e.key),
    );

    expect(await c.getValue()).toEqual(["transition/core/1/100"]);

    t.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        inputsLocked: false,
        outputsLocked: false,
        resourceReady: false,
        fields: [dField("a")],
        kv: [kv("transition/core/1/100", "first"), kv("transition/exec/2/200", "second")],
      },
    ]);

    expect(await c.getValue()).toEqual(["transition/core/1/100", "transition/exec/2/200"]);
  });

  test("re-runs its reader when a listed value changes", async () => {
    const t = rootWith([kv("transition/core/1/100", "first")]);
    const entry = t.entry();
    const c = Computable.make((ctx) =>
      ctx
        .accessor(entry)
        .node()
        .listKeyValuesAsString("transition/")
        .map((e) => e.value),
    );

    expect(await c.getValue()).toEqual(["first"]);

    t.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        inputsLocked: false,
        outputsLocked: false,
        resourceReady: false,
        fields: [dField("a")],
        kv: [kv("transition/core/1/100", "changed")],
      },
    ]);

    expect(await c.getValue()).toEqual(["changed"]);
  });

  test("re-runs its reader when a key is removed", async () => {
    const t = rootWith([kv("transition/core/1/100", "first"), kv("transition/exec/2/200", "gone")]);
    const entry = t.entry();
    const c = Computable.make((ctx) =>
      ctx
        .accessor(entry)
        .node()
        .listKeyValuesAsString("transition/")
        .map((e) => e.key),
    );

    expect(await c.getValue()).toHaveLength(2);

    t.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        inputsLocked: false,
        outputsLocked: false,
        resourceReady: false,
        fields: [dField("a")],
        kv: [kv("transition/core/1/100", "first")],
      },
    ]);

    expect(await c.getValue()).toEqual(["transition/core/1/100"]);
  });

  test("is NOT re-run when a key outside the prefix is added", async () => {
    // The whole point of the prefix: a status reader of `transition/` must not be woken by the
    // `attr/` writes a running command makes.
    const t = rootWith([kv("transition/core/1/100", "first")]);
    const entry = t.entry();
    let runs = 0;
    const c = Computable.make((ctx) => {
      runs++;
      return ctx.accessor(entry).node().listKeyValuesAsString("transition/").length;
    });

    expect(await c.getValue()).toBe(1);
    const runsAfterFirst = runs;

    t.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        inputsLocked: false,
        outputsLocked: false,
        resourceReady: false,
        fields: [dField("a")],
        kv: [kv("transition/core/1/100", "first"), kv("attr/exec/2/progress/42", "40")],
      },
    ]);

    expect(await c.getValue()).toBe(1);
    expect(runs).toBe(runsAfterFirst);
  });

  test("is NOT re-run when a key outside the prefix is removed", async () => {
    const t = rootWith([kv("transition/core/1/100", "first"), kv("attr/exec/2/progress/42", "40")]);
    const entry = t.entry();
    let runs = 0;
    const c = Computable.make((ctx) => {
      runs++;
      return ctx.accessor(entry).node().listKeyValuesAsString("transition/").length;
    });

    expect(await c.getValue()).toBe(1);
    const runsAfterFirst = runs;

    t.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        inputsLocked: false,
        outputsLocked: false,
        resourceReady: false,
        fields: [dField("a")],
        kv: [kv("transition/core/1/100", "first")],
      },
    ]);

    expect(await c.getValue()).toBe(1);
    expect(runs).toBe(runsAfterFirst);
  });

  test("treats a prefix as a prefix, not as a path segment", async () => {
    // `k1` matches `k11`: callers wanting a whole key use getKeyValue, and callers wanting a
    // segment put the separator in the prefix.
    const t = rootWith([kv("k1", "a"), kv("k11", "b"), kv("k2", "c")]);
    const c = Computable.make((ctx) =>
      ctx
        .accessor(t.entry())
        .node()
        .listKeyValuesAsString("k1")
        .map((e) => e.key)
        .sort(),
    );

    expect(await c.getValue()).toEqual(["k1", "k11"]);
  });

  test("a reader whose prefix matches nothing still sees a key appear under it", async () => {
    const t = rootWith([kv("other", "x")]);
    const entry = t.entry();
    const c = Computable.make(
      (ctx) => ctx.accessor(entry).node().listKeyValuesAsString("transition/").length,
    );

    expect(await c.getValue()).toBe(0);

    t.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        inputsLocked: false,
        outputsLocked: false,
        resourceReady: false,
        fields: [dField("a")],
        kv: [kv("other", "x"), kv("transition/core/1/100", "first")],
      },
    ]);

    expect(await c.getValue()).toBe(1);
  });

  test("throws outside its computable run, like the other KV getters", async () => {
    const t = rootWith([kv("k", "v")]);
    const entry = t.entry();
    let escaped: PlTreeNodeAccessor | undefined;
    const c = Computable.make((ctx) => {
      escaped = ctx.accessor(entry).node();
      return escaped.listKeyValues().length;
    });
    expect(await c.getValue()).toBe(1);

    expect(() => escaped!.listKeyValues()).toThrow();
    expect(() => escaped!.listKeyValuesAsString()).toThrow();
    expect(() => escaped!.listFields()).toThrow();
  });
});

describe("listFields", () => {
  test("returns fields of every type", async () => {
    const t = rootWith([], [iField("in"), field("Output", "out"), dField("dyn")]);
    const c = Computable.make((ctx) => ctx.accessor(t.entry()).node().listFields().sort());

    expect(await c.getValue()).toEqual(["dyn", "in", "out"]);
  });

  test("is unstable while the field lists can still grow", async () => {
    // Matches listInputFields/listOutputFields: awaitStableValue must not settle on a partial list.
    const t = rootWith([], [iField("in")]);
    const c = Computable.make((ctx) => ctx.accessor(t.entry()).node().listFields());

    expect((await c.getFullValue()).stable).toBe(false);
  });

  test("is stable once both field lists are locked", async () => {
    const t = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
    t.updateFromResourceData([{ ...TestDynamicRootState1, fields: [iField("in")], kv: [] }]);
    const c = Computable.make((ctx) => ctx.accessor(t.entry()).node().listFields());

    expect((await c.getFullValue()).stable).toBe(true);
  });

  test("re-runs its reader when a field appears", async () => {
    const t = rootWith([], [dField("child/1")]);
    const entry = t.entry();
    const c = Computable.make((ctx) => ctx.accessor(entry).node().listFields());

    expect(await c.getValue()).toEqual(["child/1"]);

    t.updateFromResourceData([
      {
        ...TestDynamicRootState1,
        inputsLocked: false,
        outputsLocked: false,
        resourceReady: false,
        fields: [dField("child/1"), dField("child/2")],
        kv: [],
      },
    ]);

    expect(await c.getValue()).toEqual(["child/1", "child/2"]);
  });
});
