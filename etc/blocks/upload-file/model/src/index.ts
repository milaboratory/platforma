import type { ImportFileHandle, InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-upload-file.kind";
import * as v from "valibot";

export const ImportFileHandleSchema = v.optional(
  v.pipe(
    v.string(),
    v.transform((value): ImportFileHandle => value as ImportFileHandle),
  ),
);

export const BlockData = v.object({
  inputHandle: ImportFileHandleSchema,
});

export type BlockData = v.InferOutput<typeof BlockData>;

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

  // Nothing to project: the kind takes no params, because a signed upload handle is
  // machine- and session-local and would not resolve in the project a template is
  // applied into. An exported entry re-creates this block ready for a fresh upload.
  .templateParams(() => ({}))

  .output("blob", (ctx) => ctx.outputs?.resolve("blob")?.getDataAsJsonOrUndefined<unknown>())

  .output("handle", (ctx) => ctx.outputs?.resolve("handle")?.getImportProgress())

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
