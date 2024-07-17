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
    const result = await helper.renderTemplate(
      true,
      "test.workflow1",
      ["result", "context"],
      (tx) => ({
        args: createObject(tx, { testValue: "Truman" }),
        blockId: createObject(tx, "block1"),
        isProduction: createObject(tx, true),
        context: tx.createEphemeral({ name: 'BContextEnd', version: '1' }),
      })
    );

    const outputResult = result.computeOutput("result", (a) => a?.getField("outputResult")?.value?.getDataAsJson());
    const exportResult = result.computeOutput("context", (a) => a?.getField("values/exportResult")?.value?.getDataAsJson())
    
    expect(await outputResult.awaitStableValue()).eq("Truman Show Run");
    expect(await exportResult.awaitStableValue()).eq("Truman Show Run");
  });
