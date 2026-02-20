import type {
  ImportFileHandle,
  InferHrefType,
  InferOutputsType,
  RemoteBlobHandleAndSize,
} from "@platforma-sdk/model";
import { BlockModel } from "@platforma-sdk/model";
import { z } from "zod";

export const ImportFileHandleSchema = z
  .string()
  .optional()
  .refine<ImportFileHandle | undefined>(
    ((_a) => true) as (arg: string | undefined) => arg is ImportFileHandle | undefined,
  );

export const BlockArgs = z.object({
  inputHandles: z.array(ImportFileHandleSchema),
});

export type BlockArgs = z.infer<typeof BlockArgs>;

export const platforma = BlockModel.create("Heavy")

  .withArgs({
    inputHandles: [] as ImportFileHandle[],
  })

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

  .done(2);

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
