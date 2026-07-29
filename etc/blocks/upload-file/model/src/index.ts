import type { ImportFileHandle, InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-upload-file.kind";
import { z } from "zod";

export const ImportFileHandleSchema = z
  .string()
  .optional()
  .refine<ImportFileHandle | undefined>(
    ((_a) => true) as (arg: string | undefined) => arg is ImportFileHandle | undefined,
  );

export const BlockData = z.object({
  inputHandle: ImportFileHandleSchema,
});

export type BlockData = z.infer<typeof BlockData>;

/** What the workflow consumes — projected from {@link BlockData} by the args lambda. */
export type BlockArgs = {
  inputHandle: ImportFileHandle | undefined;
};

// The kind declares no init params — the signed path in `inputHandle` can only
// come from a real desktop file-dialog gesture, so there is nothing a creator or
// a template could seed it with. `init` always returns the unset default.
const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .init(() => ({ inputHandle: undefined }));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args<BlockArgs>((data) => ({ inputHandle: data.inputHandle }))

  .output("blob", (ctx) => ctx.outputs?.resolve("blob")?.getDataAsJsonOrUndefined<unknown>())

  .output("handle", (ctx) => ctx.outputs?.resolve("handle")?.getImportProgress())

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
