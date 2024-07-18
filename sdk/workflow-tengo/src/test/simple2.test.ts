import { Pl } from "@milaboratory/pl-middle-layer";
import { tplTest } from "@milaboratory/sdk-test";

tplTest("test import template", /*{timeout: 10000},*/ async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    "test.simple2",
    ["main"],
    (tx) => ({
      a: tx.createValue(
        Pl.JsonString,
        JSON.stringify("A")
      ),
      b: tx.createValue(
        Pl.JsonString,
        JSON.stringify("B")
      )
    })
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());

  expect(await mainResult.awaitStableValue()).eq("AB");
});
