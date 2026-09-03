import { Computable } from "@milaboratories/computable";
import { field, Pl, TestHelpers } from "@milaboratories/pl-client";
import { SynchronizedTreeState } from "@milaboratories/pl-tree";
import type { Cfg, PlResourceEntry } from "@platforma-sdk/model";
import { expect, test } from "vitest";
import { MiddleLayerDriverKit } from "../middle_layer/driver_kit";
import { computableFromCfgUnsafe } from "./executor";

// The SDK no longer ships a builder for these configs — it went away with the v1/v2
// block model — but the executor still has to render configs of blocks published
// before that. So the fixtures below are spelled out as plain `Cfg` trees.

const ctxVar = (variable: string): Cfg => ({ type: "GetFromCtx", variable });
const imm = (value: unknown): Cfg => ({ type: "Immediate", value });
const jsonField = (source: Cfg, field: Cfg): Cfg => ({ type: "GetJsonField", source, field });
const resourceField = (source: Cfg, field: Cfg): Cfg => ({
  type: "GetResourceField",
  source,
  field,
});

const Args = ctxVar("$args");
const It = ctxVar("$it");
const MainOutputs = ctxVar("$prod");

test("local cfg test (no pl)", async () => {
  const args = {
    theC: "c",
    a: { c: "hi" },
    b: ["a", "b", "c"],
  };
  const theCValue = jsonField(Args, imm("theC"));

  const outputs = {
    out1: jsonField(jsonField(Args, imm("a")), theCValue),
    out2: {
      type: "MapArrayValues",
      source: jsonField(Args, imm("b")),
      itVar: "$it",
      mapping: { type: "Isolate", cfg: { type: "MakeObject", template: { theField: It } } },
    },
  } satisfies Record<string, Cfg>;

  const ctx = { $args: args };

  const computable1 = computableFromCfgUnsafe({} as MiddleLayerDriverKit, ctx, outputs.out1);
  expect(await computable1.getValue()).toEqual("hi");

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
  const theCValue = jsonField(Args, imm("theC"));

  const outputs = {
    out1: jsonField(
      { type: "GetResourceValueAsJson", source: resourceField(MainOutputs, theCValue) },
      imm("someField"),
    ),
  } satisfies Record<string, Cfg>;

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
