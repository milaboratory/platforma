import type { ImportFileHandle, InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import {
  BlockModel,
  getResourceField,
  getResourceValueAsJson,
  MainOutputs,
} from "@platforma-sdk/model";
import { z } from "zod";

export const ImportFileHandleSchema = z
  .string()
  .optional()
  .refine<ImportFileHandle | undefined>(
    ((_a) => true) as (arg: string | undefined) => arg is ImportFileHandle | undefined,
  );

export const BlockArgs = z.object({
  inputHandle: ImportFileHandleSchema,
});

export type BlockArgs = z.infer<typeof BlockArgs>;

export const platforma = BlockModel.create("Heavy")

  .withArgs({
    inputHandle: undefined,
  })

  .output("blob", getResourceValueAsJson()(getResourceField(MainOutputs, "blob")))

  .output("handle", (ctx) => ctx.outputs?.resolve("handle")?.getImportProgress())

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
