import { BlockModel, type InferHrefType, type InferOutputsType } from "@platforma-sdk/model";

export type BlockArgs = {
  titleArg: string;
  subtitleArg: string;
  badgeArg: string;
  tagToWorkflow: string;
  tagArgs: string[];
};

export const platforma = BlockModel.create("Heavy")

  .withArgs<BlockArgs>({
    titleArg: "The title",
    subtitleArg: "The subtitle",
    badgeArg: "The badge",
    tagToWorkflow: "workflow-tag",
    tagArgs: [],
  })

  .sections((ctx) => {
    return [
      {
        type: "link",
        href: "/",
        label: "Main",
        badge: ctx.args.badgeArg,
      },
    ];
  })

  .title((ctx) => ctx.args.titleArg + " <- the title")

  .subtitle((ctx) => ctx.args.subtitleArg + " <- the subtitle")

  .tags((ctx) => {
    const result = ["test-tag", ...ctx.args.tagArgs];
    const outputFormTheWorkflow = ctx.outputs?.resolve("theOutput")?.getDataAsJson<string>();
    if (outputFormTheWorkflow) {
      result.push(outputFormTheWorkflow);
    }
    return result;
  })

  .output("delayedOutput", (ctx) => ctx.outputs?.resolve("delayedContent")?.getDataAsString())

  .outputWithStatus("delayedOutputWithStatus", (ctx) =>
    ctx.outputs?.resolve("delayedContent")?.getDataAsString(),
  )

  .done(2);

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
