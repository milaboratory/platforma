import type { InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import { BlockModel } from "@platforma-sdk/model";
import { z } from "zod";

// The block takes no inputs: it just runs an impure command. argsValid is always
// true, so the workflow runs as soon as the block is created.
export const BlockArgs = z.object({});

export type BlockArgs = z.infer<typeof BlockArgs>;

export const platforma = BlockModel.create("Heavy")

  .withArgs<BlockArgs>({})

  // The non-deterministic value produced by the workflow command (changes every run).
  .output("nonpureValue", (ctx) => ctx.outputs?.resolve("nonpureValue")?.getDataAsString())

  .argsValid(() => true)

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done(2); // ui api version 2

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
