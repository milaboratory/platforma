import { Pl, type PlTransaction } from "@milaboratory/pl-middle-layer";
import { tplTest } from "@milaboratory/sdk-test";

function createObject(tx: PlTransaction, value: any) {
  return tx.createValue(
    Pl.JsonObject,
    JSON.stringify(value)
  )
}

tplTest(
  "should return results when run body of the workflow",
  async ({ helper, expect }) => {

    const prod = await helper.renderWorkflow(
      "test.workflow.wf1",
      false,
      { testValue: "Truman Prod" }
    );

    expect(await prod.output("outputResult", (a) => a?.getDataAsJson()).awaitStableValue()).eq("Truman Prod Show Run");
  });



tplTest(
  "should return results when pre run of the workflow",
  async ({ helper, expect }) => {

    const prerun = await helper.renderWorkflow(
      "test.workflow.wf1",
      true,
      { testValue: "Truman PreRun" }
    );

    expect(await prerun.output("outputResult", (a) => a?.getDataAsJson()).awaitStableValue()).eq("Truman PreRun Show Run");
  });
