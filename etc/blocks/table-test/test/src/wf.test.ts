import { blockTest } from "@platforma-sdk/test";
import { blockSpec } from "this-block";

blockTest("workflow produces table content", { timeout: 30000 }, async ({ rawPrj: project, expect }) => {
  const blockId = await project.addBlock("Block", blockSpec);

  const stableOverview1 = await project.overview.awaitStableValue();
  expect(stableOverview1.blocks[0]).toMatchObject({
    sections: [{ type: "link", href: "/", label: "Main" }],
  });

  await project.runBlock(blockId);

  const stableOverview2 = await project.overview.awaitStableValue();
  expect(stableOverview2.blocks[0]).toMatchObject({
    title: "Table Test",
  });
});
