import { tplTest } from "@platforma-sdk/test";

tplTest("software-info-loads", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    "exec.test.artifacts-software",
    ["main"],
    (tx) => ({})
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());

  const val = await mainResult.awaitStableValue() as {
    name: string,
    version: string,
    blobRef: any,
    descriptor: any,
    execs: string[]
   }


  expect(val.name).eq("@platforma-sdk/workflow-tengo-tests:exec.test.pkg.sleep")
  expect(val.version).not.eq("")
  expect(val.execs.length).gt(0)
  expect(val).toHaveProperty("blobRef")
  expect(val).toHaveProperty("descriptor")
});

tplTest("asset-info-loads", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    "exec.test.artifacts-asset",
    ["main"],
    (tx) => ({})
  );
  const mainResult = result.computeOutput("main", (a) => a?.getDataAsJson());

  const val = await mainResult.awaitStableValue() as {
    name: string,
    version: string,
    blobRef: any,
    descriptor: any,
    execs: string[]
   }

  expect(val.name).eq("@platforma-sdk/workflow-tengo-tests:exec.test.pkg.asset")
  expect(val.version).not.eq("")
  expect(val).toHaveProperty("blobRef")
  expect(val).toHaveProperty("descriptor")
});
