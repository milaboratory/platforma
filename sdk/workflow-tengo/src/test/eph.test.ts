import { Pl } from "@milaboratory/pl-middle-layer";
import { tplTest } from "@milaboratory/sdk-test";

tplTest("should return value when run simple ephemeral template", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    true,
    "test.eph1",
    ["main"],
    (tx) => ({
      input1: tx.createValue(
        Pl.JsonObject,
        JSON.stringify({ testValue: "Truman" })
      ),
    })
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  expect(await mainResult.awaitStableValue()).eq("Truman Show");
});

tplTest("should set output when get outputs from output map in ephemeral template", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    true,
    "test.eph2",
    ["main"],
    (tx) => ({
      input1: tx.createValue(
        Pl.JsonObject,
        JSON.stringify({ testValue: "Truman" })
      ),
    })
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  expect(await mainResult.awaitStableValue()).eq("Truman Show");
});

tplTest("should set output when not all inputs are ready", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    true,
    "test.eph1",
    ["main"],
    (tx) => ({
      input1: tx.createStruct(
        Pl.JsonObject,
        JSON.stringify({ testValue: "Truman" })
      ),
    })
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());
  expect(await mainResult.awaitStableValue()).eq("Truman Show");
});
