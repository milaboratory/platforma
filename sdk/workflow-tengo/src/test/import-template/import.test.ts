import { Pl } from "@milaboratory/pl-middle-layer";
import { tplTest } from "@milaboratory/sdk-test";

tplTest("test import template in pure template", /*{timeout: 10000},*/ async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    "test.import-template.pure-template",
    ["main"],
    (tx) => ({
      a: tx.createValue(
        Pl.JsonObject,
        JSON.stringify("A")
      ),
      b: tx.createValue(
        Pl.JsonObject,
        JSON.stringify("B")
      )
    })
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());

  expect(await mainResult.awaitStableValue()).eq("AB");
});



tplTest("test import template in workflow", /*{timeout: 10000},*/ async ({ helper, expect }) => {

  const wf = await helper.renderWorkflow(
    "test.import-template.workflow",
    false,
    { a: "c", b: "d" }
  );

  const output = wf.output("main", (a) => a?.getDataAsJson());


  expect(await output.awaitStableValue()).eq("cd");
});
