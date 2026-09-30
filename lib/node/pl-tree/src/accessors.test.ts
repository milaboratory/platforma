import { expect, test } from "vitest";
import { Computable } from "@milaboratories/computable";
import {
  createSignedResourceId,
  DefaultFinalResourceDataPredicate,
} from "@milaboratories/pl-client";
import type { PlTreeNodeAccessor } from "./accessors";
import { PlTreeState } from "./state";
import {
  dField,
  TestDynamicRootId1,
  TestDynamicRootState1,
  TestValueResourceState1,
} from "./test_utils";

const V = createSignedResourceId(20n);

/** A non-final root with nothing locked, so an absent field is unstable unless told otherwise. */
function openRoot(): PlTreeState {
  const t = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  t.updateFromResourceData([
    {
      ...TestDynamicRootState1,
      inputsLocked: false,
      outputsLocked: false,
      resourceReady: false,
      fields: [],
    },
  ]);
  return t;
}

test("B13: common traversal options reach getField", async () => {
  const entry = openRoot().entry();
  const perStep = Computable.make((c) =>
    c.accessor(entry).node().traverse({ field: "g", stableIfNotFound: true }),
  );
  const common = Computable.make((c) =>
    c.accessor(entry).node().traverseWithCommon({ stableIfNotFound: true }, "g"),
  );
  const a = await perStep.getFullValue();
  const b = await common.getFullValue();
  expect(a.value).toBeUndefined();
  expect(b.value).toBeUndefined();
  expect(a.stable).toBe(true);
  expect(b.stable).toBe(true);
});

test("B13: a common assertFieldType is checked", async () => {
  const t = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  t.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField("v", V)] },
    { ...TestValueResourceState1, id: V, data: Buffer.from("x") },
  ]);
  const entry = t.entry();
  const c = Computable.make((ctx) =>
    ctx.accessor(entry).node().traverseWithCommon({ assertFieldType: "Input" }, "v"),
  );
  await expect(c.getValue()).rejects.toThrow(/Unexpected field type/);
});

test("B14: data getters refuse to run outside their computable run, like every other member", async () => {
  const t = new PlTreeState(TestDynamicRootId1, DefaultFinalResourceDataPredicate);
  t.updateFromResourceData([
    { ...TestDynamicRootState1, fields: [dField("v", V)] },
    {
      ...TestValueResourceState1,
      id: V,
      data: Buffer.from('"hello"'),
      kv: [{ key: "k", value: Buffer.from('"kv"') }],
    },
  ]);
  const entry = t.entry();
  let leaked: PlTreeNodeAccessor | undefined;
  const c = Computable.make((ctx) => {
    leaked = ctx.accessor(entry).node().traverse("v");
    return leaked?.getDataAsJson();
  });
  expect(await c.getValue()).toBe("hello");

  const escaped = leaked!;
  expect(() => escaped.getData()).toThrow();
  expect(() => escaped.getDataAsString()).toThrow();
  expect(() => escaped.getDataAsJson()).toThrow();
  expect(() => escaped.getKeyValueAsJson("k")).toThrow();
  expect(() => escaped.getKeyValueAsString("k")).toThrow();
});
