import { blockTest } from "@platforma-sdk/test";
import { blockSpec } from "this-block";

blockTest(
  "workflow produces table from PFrame",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect }) => {
    const blockId = await project.addBlock("Block", blockSpec);

    await project.runBlock(blockId);
    const state = await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 50000);

    const tableOutput = state.outputs!["table"] as { ok: boolean; value: unknown };
    expect(tableOutput.ok).toBe(true);
    expect(tableOutput.value).toBeDefined();
  },
);
