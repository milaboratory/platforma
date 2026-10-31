import { awaitStableState, tplTest } from "@platforma-sdk/test";

tplTest("renderWorkflow passes blockId as the middle layer does", async ({ helper, expect }) => {
  const wf = await helper.renderWorkflow("workflow.blockid", false, {}, { blockId: "b-test-1" });
  const blockId = wf.output("blockId", (a) => a?.getDataAsJson<string>());
  expect(await awaitStableState(blockId)).eq("b-test-1");
});
