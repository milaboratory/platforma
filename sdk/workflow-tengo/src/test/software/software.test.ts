import { tplTest } from "@milaboratory/sdk-test";

tplTest("software-info-loads", async ({ helper, expect }) => {
  const result = await helper.renderTemplate(
    false,
    "test.software.software-info",
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

  expect(val.name).eq("@milaboratory/tengo-sdk:test.software.my-software")
  expect(val.version).not.eq("")
  expect(val.execs.length).gt(0)
  expect(val).toHaveProperty("blobRef")
  expect(val).toHaveProperty("descriptor")
});
