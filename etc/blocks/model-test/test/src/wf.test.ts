import type { BlockData } from "@milaboratories/milaboratories.test-block-model.model";
import { blockTest } from "@platforma-sdk/test";
import { createPlDataTableStateV2, pluginOutputKey } from "@platforma-sdk/model";
import { blockSpec } from "this-block";

blockTest("with args", { timeout: 10000 }, async ({ rawPrj: project, expect }) => {
  const blockId = await project.addBlock("Block", blockSpec);

  const stableOverview1 = await project.overview.awaitStableValue();

  expect(stableOverview1.blocks[0]).toMatchObject({
    subtitle: "The subtitle <- the subtitle",
    tags: ["test-tag", "plugin-test"],
    sections: [
      {
        type: "link",
        href: "/",
        label: "Main",
        badge: "The badge",
      },
    ],
  });

  await project.mutateBlockStorage(blockId, {
    operation: "update-block-data",
    value: {
      titleArg: "Custom title",
      subtitleArg: "Custom subtitle",
      badgeArg: "Custom badge",
      tagToWorkflow: "workflow-tag",
      tagArgs: ["tag-one", "tag-two"],
      tableState: createPlDataTableStateV2(),
    } satisfies BlockData,
  });

  const stableOverview2 = await project.overview.awaitStableValue();

  expect(stableOverview2.blocks[0]).toMatchObject({
    title: "Custom title <- the title",
    subtitle: "Custom subtitle <- the subtitle",
    tags: ["test-tag", "plugin-test", "tag-one", "tag-two"],
    sections: [
      {
        type: "link",
        href: "/",
        label: "Main",
        badge: "Custom badge",
      },
    ],
  });

  await project.runBlock(blockId);

  const stableOverview3 = await project.overview.awaitStableValue();

  expect(stableOverview3.blocks[0]).toMatchObject({
    tags: ["test-tag", "plugin-test", "tag-one", "tag-two", "workflow-tag"],
  });
});

blockTest(
  "block-level services",
  { timeout: 30000 },
  async ({ rawPrj: project, helpers, expect }) => {
    const blockId = await project.addBlock("Block", blockSpec);

    await project.runBlock(blockId);
    const blockState = await helpers.awaitBlockDoneAndGetStableBlockState(blockId);

    // Block-level pframeSpec service
    expect(blockState.outputs?.blockSpecFrameTest).toStrictEqual({
      ok: true,
      value: "blockSpecFrame: created (auto-disposed)",
      stable: true,
    });

    // createPlDataTable with workflow PFrame data
    expect(blockState.outputs?.blockTableTest).toMatchObject({
      ok: true,
      stable: true,
    });

    // Plugin outputs are keyed with a prefix — access via plain record
    const outputs = blockState.outputs as Record<string, unknown> | undefined;

    // Plugin-level pframeSpec service
    expect(outputs?.[pluginOutputKey("counter" as any, "specFrameTest")]).toStrictEqual({
      ok: true,
      value: "specFrame: created and manually disposed",
      stable: true,
    });

    // Plugin-level pframe service
    const pframeOutput = outputs?.[pluginOutputKey("counter" as any, "pframeTest")] as any;
    expect(pframeOutput).toMatchObject({ ok: true, stable: true });
    expect(pframeOutput?.value).toMatch(/^pframe: created handle/);
  },
);
