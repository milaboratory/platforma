import type {
  ImportFileHandle,
  InferHrefType,
  InferOutputsType,
  RemoteBlobHandleAndSize,
} from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.transfer-files.kind";
import * as v from "valibot";

export const ImportFileHandleSchema = v.pipe(
  v.string(),
  v.transform((value): ImportFileHandle => value as ImportFileHandle),
);

export const BlockData = v.object({
  inputHandles: v.array(ImportFileHandleSchema),
});

export type BlockData = v.InferOutput<typeof BlockData>;

/** What the workflow consumes — projected from {@link BlockData} by the args lambda. */
export type BlockArgs = {
  inputHandles: ImportFileHandle[];
};

// The kind declares no init params — every entry of `inputHandles` is a signed
// path that can only come from a real desktop file-dialog gesture, so there is
// nothing a creator or a template could seed them with. `init` always returns
// the empty list.
const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .init(() => ({ inputHandles: [] }));

export const platforma = BlockModelV3.create({ dataModel, kind })

  // The one field is workflow input in its entirety: no UI-only state to strip,
  // and no prerun phase to project into (the workflow declares `wf.body` only).
  // Handles pass through as-is — the workflow keys its import/export maps by
  // handle, so it dedups on its own side.
  .args<BlockArgs>((data) => ({ inputHandles: [...data.inputHandles] }))

  // Nothing to project: the kind takes no params, because every entry of
  // `inputHandles` is a signed path from an OS file-dialog gesture and would not
  // resolve in the project a template is applied into.
  .templateParams(() => ({}))

  // fileImports: smart.createMapResource(maps.mapValues(fileImports, func(im) {
  //   return im.handle
  // }))

  .output(
    "fileImports",
    (ctx) =>
      Object.fromEntries(
        ctx.outputs
          ?.resolve({ field: "fileImports", assertFieldType: "Input" })
          ?.mapFields((handle, acc) => [handle as ImportFileHandle, acc.getImportProgress()], {
            skipUnresolved: true,
          }) ?? [],
      ),
    { isActive: true },
  )

  .output(
    "fileExports",
    (ctx) =>
      Object.fromEntries(
        ctx.outputs
          ?.resolve({ field: "fileExports", assertFieldType: "Input" })
          ?.mapFields((handle, acc) => [handle as ImportFileHandle, acc.getRemoteFileHandle()], {
            skipUnresolved: true,
          }) ?? [],
      ) as unknown as Record<ImportFileHandle, RemoteBlobHandleAndSize | undefined>,
    { isActive: true },
  )

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
