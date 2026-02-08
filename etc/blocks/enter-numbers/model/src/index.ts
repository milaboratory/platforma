import type { InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import { BlockModel } from "@platforma-sdk/model";
import { z } from "zod";

export const $BlockArgs = z.object({
  numbers: z.array(z.coerce.number()),
});

export type BlockArgs = z.infer<typeof $BlockArgs>;

export const platforma = BlockModel.create("Heavy")

  .withArgs<BlockArgs>({ numbers: [] })

  .output("numbers", (ctx) => ctx.outputs?.resolve("numbers")?.getDataAsJson<number[]>())

  .output("errorIfNumberIs999", (ctx) => {
    if (ctx.args.numbers.length === 1 && ctx.args.numbers[0] === 999) {
      return ctx.prerun?.resolve("numbers")?.getFileContentAsJson<number[]>();
    }
    return ctx.args.numbers;
  })

  .output("activeArgs", (ctx) => ctx.activeArgs)

  .output("ctx", (ctx) => ctx)

  .output("ctx.activeArgs", (ctx) => ctx.activeArgs)

  .output("ctx.args", (ctx) => ctx.args)

  .output("ctx.data", (ctx) => ctx.data)

  .output("ctx.uiState", (ctx) => ctx.uiState)

  .argsValid((ctx) => ctx.args.numbers.length > 0)

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done(2); // ui api version 2

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
