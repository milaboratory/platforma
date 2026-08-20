import { Computable } from "@milaboratories/computable";
import { field, Pl, TestHelpers } from "@milaboratories/pl-client";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import {
  Args,
  getJsonField,
  getResourceField,
  getResourceValueAsJson,
  InferOutputType,
  isolate,
  It,
  MainOutputs,
  makeObject,
  mapArrayValues,
  PlResourceEntry,
  TypedConfig,
} from "@platforma-sdk/model";
import { expect, test } from "vitest";
import { MiddleLayerDriverKit } from "../middle_layer/driver_kit";
import { computableFromCfgUnsafe } from "./executor";

test("local cfg test (no pl)", async () => {
  const args = {
    theC: "c",
    a: { c: "hi" },
    b: ["a", "b", "c"],
  };
  const theCValue = getJsonField(Args, "theC");

  const outputs = {
    out1: getJsonField(getJsonField(Args, "a"), theCValue),
    out2: mapArrayValues(getJsonField(Args, "b"), isolate(makeObject({ theField: It }))),
  } satisfies Record<string, TypedConfig>;

  const ctx = { $args: args };

  const computable1 = computableFromCfgUnsafe({} as MiddleLayerDriverKit, ctx, outputs.out1);
  const out1 = (await computable1.getValue()) as InferOutputType<
    (typeof outputs)["out1"],
    typeof args,
    unknown
  >;
  expect(out1).toEqual("hi");

  const computable2 = computableFromCfgUnsafe({} as MiddleLayerDriverKit, ctx, outputs.out2);
  const out2 = await computable2.getValue();
  expect(out2).toStrictEqual([{ theField: "a" }, { theField: "b" }, { theField: "c" }]);
});

type TestResourceValue = {
  someField: number;
};

test("cfg test with pl, simple", async () => {
  const input = {
    theC: "c",
  };
  const theCValue = getJsonField(Args, "theC");

  const outputs = {
    out1: getJsonField(
      getResourceValueAsJson<TestResourceValue>()(getResourceField(MainOutputs, theCValue)),
      "someField",
    ),
  } satisfies Record<string, TypedConfig>;

  await TestHelpers.withTempRoot(async (pl) => {
    const tree = await SynchronizedTreeState.init(pl, pl.clientRoot, {
      pollingInterval: 250,
      stopPollingDelay: 500,
    });

    const ctx = {
      $args: input,
      $prod: tree.entry() as any as PlResourceEntry,
    };

    const computable: Computable<unknown> = computableFromCfgUnsafe(
      {} as MiddleLayerDriverKit,
      ctx,
      outputs.out1,
    ) as any;

    expect(await computable.getValue()).toBeUndefined();

    await pl.withWriteTx("addingTestResource", async (tx) => {
      tx.createField(
        field(pl.clientRoot, "c"),
        "Dynamic",
        tx.createValue(Pl.JsonObject, JSON.stringify({ someField: 42 } as TestResourceValue)),
      );
      await tx.commit();
    });

    await computable.refreshState();

    expect(await computable.getValue()).toEqual(42);
  });
});
