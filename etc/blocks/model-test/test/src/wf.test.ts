import type { BlockArgs } from "@milaboratories/milaboratories.test-block-model.model";
import { blockTest } from "@platforma-sdk/test";
import { blockSpec } from "this-block";

blockTest("with args", { timeout: 10000 }, async ({ rawPrj: project, expect }) => {
  const blockId = await project.addBlock("Block", blockSpec);

  const stableOverview1 = await project.overview.awaitStableValue();

  expect(stableOverview1.blocks[0]).toMatchObject({
    subtitle: "The subtitle <- the subtitle",
    tags: ["test-tag"],
    sections: [
      {
        type: "link",
        href: "/",
        label: "Main",
        badge: "The badge",
      },
    ],
  });

  await project.setBlockArgs(blockId, {
    titleArg: "Custom title",
    subtitleArg: "Custom subtitle",
    badgeArg: "Custom badge",
    tagToWorkflow: "workflow-tag",
    tagArgs: ["tag-one", "tag-two"],
  } satisfies BlockArgs);

  const stableOverview2 = await project.overview.awaitStableValue();

  expect(stableOverview2.blocks[0]).toMatchObject({
    title: "Custom title <- the title",
    subtitle: "Custom subtitle <- the subtitle",
    tags: ["test-tag", "tag-one", "tag-two"],
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
    tags: ["test-tag", "tag-one", "tag-two", "workflow-tag"],
  });
});
