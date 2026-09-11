import type { ImportFileHandle, InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-blob-url-custom-protocol.kind";
import * as v from "valibot";

export const ImportFileHandleSchema = v.optional(
  v.pipe(
    v.string(),
    v.transform((value): ImportFileHandle => value as ImportFileHandle),
  ),
);

export const BlockData = v.object({
  inputTgzHandle: ImportFileHandleSchema,
  inputZipHandle: ImportFileHandleSchema,
});

export type BlockData = v.InferOutput<typeof BlockData>;

/** What the workflow consumes — projected from {@link BlockData} by the args lambda. */
export type BlockArgs = {
  inputTgzHandle: ImportFileHandle | undefined;
  inputZipHandle: ImportFileHandle | undefined;
};

// This block takes no init params (its kind declares `Record<string, never>`):
// both fields are desktop-signed `ImportFileHandle`s, which no template can
// pre-wire. So `init` ignores params and returns the unset defaults.
const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .init(() => ({ inputTgzHandle: undefined, inputZipHandle: undefined }));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args<BlockArgs>((data) => ({
    inputTgzHandle: data.inputTgzHandle,
    inputZipHandle: data.inputZipHandle,
  }))

  // Nothing to project: the kind takes no params, because both handles are signed,
  // session-local references from an OS file-dialog gesture and would not resolve in
  // the project a template is applied into.
  .templateParams(() => ({}))

  .output("handleTgz", (ctx) => ctx.outputs?.resolve("handleTgz")?.getImportProgress())
  .output("handleZip", (ctx) => ctx.outputs?.resolve("handleZip")?.getImportProgress())

  // Both archive outputs use the accessor form. V1 drove `tgz_content` through
  // the config-based `extractArchiveAndGetURL(getResourceField(MainOutputs, …))`
  // helpers so the block covered both surfaces; those helpers return a
  // `TypedConfig`, which only V1's `output()` accepts — `BlockModelV3.output()`
  // takes render lambdas only. The config surface is therefore gone here, and
  // the two outputs differ solely in the archive format they extract.
  .output("tgz_content", (ctx) => ctx.outputs?.resolve("siteTgz")?.extractArchiveAndGetURL("tgz"))

  .output("zip_content", (ctx) => ctx.outputs?.resolve("siteZip")?.extractArchiveAndGetURL("zip"))

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
