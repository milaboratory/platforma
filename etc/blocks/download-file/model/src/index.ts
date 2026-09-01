import type { ImportFileHandle, InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-download-file.kind";
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

// `params` is optional — a block may be created without a template supplying
// them — so the kind-declared field keeps a fallback default.
const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .init(({ params }) => ({ inputHandle: params?.inputHandle }));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args<BlockArgs>((data) => ({ inputHandle: data.inputHandle }))

  // The kind declares `inputHandle` as an init param, so the projection emits it —
  // narrowing the contract here is not this block's call to make. Whether the handle
  // still resolves is the importing side's problem, and only it can tell.
  .templateParams((data) => ({ inputHandle: data.inputHandle }))

  .output("blob", (ctx) => ctx.outputs?.resolve("blob")?.getDataAsJsonOrUndefined<unknown>())

  .output("handle", (ctx) => ctx.outputs?.resolve("handle")?.getImportProgress())

  // The V3 render context exposes no raw-bytes blob accessor (only base64 and
  // string), so the former `content` output — V1's `getBlobContent` — becomes
  // base64 here, and is named for what it actually returns.
  .output("contentAsBase64", (ctx) =>
    ctx.outputs?.resolve("downloadable")?.getFileContentAsBase64(),
  )

  .output("contentAsString", (ctx) =>
    ctx.outputs?.resolve("downloadable")?.getFileContentAsString(),
  )

  .output("contentAsString1", (ctx) =>
    ctx.outputs
      ?.resolve("downloadable")
      ?.getFileContentAsString()
      .mapDefined((v) => v + v),
  )

  .output("contentAsStringRange", (ctx) =>
    ctx.outputs?.resolve("downloadable")?.getFileContentAsString({ from: 1, to: 2 }),
  )

  .output("contentAsStringRange1", (ctx) =>
    ctx.outputs
      ?.resolve("downloadable")
      ?.getFileContentAsString({ from: 1, to: 2 })
      .mapDefined((v) => v + v),
  )

  .output("contentAsJson", (ctx) =>
    ctx.outputs?.resolve("downloadable")?.getFileContentAsJson<unknown>(),
  )

  .output("downloadedBlobContent", (ctx) => ctx.outputs?.resolve("downloadable")?.getFileHandle())

  .output("onDemandBlobContent", (ctx) =>
    ctx.outputs?.resolve("downloadable")?.getRemoteFileHandle(),
  )

  .output("onDemandBlobContent1", (ctx) =>
    ctx.outputs?.resolve("downloadable")?.getRemoteFileHandle(),
  )

  .output("getFileHandle", (ctx) => ctx.outputs?.resolve("downloadable")?.getFileHandle())

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
