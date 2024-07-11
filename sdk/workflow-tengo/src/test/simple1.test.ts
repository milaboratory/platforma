import { Pl } from "@milaboratory/pl-middle-layer";
import { tplTest } from "@milaboratory/sdk-test";

tplTest("test1", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    "test.simple1",
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
