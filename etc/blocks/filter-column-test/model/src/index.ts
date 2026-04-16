import type { InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import {
  BlockModelV3,
  DataModelBuilder,
  buildDatasetOptions,
  createPrimaryRef,
  isPrimaryRef,
} from "@platforma-sdk/model";
import type { PlRef, PrimaryRef } from "@platforma-sdk/model";
import { z } from "zod";

export const BlockData = z.object({
  dataset: z.any().optional(),
});

export type BlockData = z.infer<typeof BlockData>;

const dataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({}));

export const platforma = BlockModelV3.create(dataModel)

  .args<{ dataset: PrimaryRef }>((data) => {
    const v = data.dataset;
    if (v === undefined) throw new Error("Select a dataset");
    const primary: PrimaryRef = isPrimaryRef(v) ? v : createPrimaryRef(v as PlRef);
    return { dataset: primary };
  })

  .output("datasetOptions", (ctx) => buildDatasetOptions(ctx))

  .output("tableContent", (ctx) => ctx.outputs?.resolve("tableFile")?.getFileContentAsString())

  .sections((_ctx) => [{ type: "link", href: "/", label: "Main" }])

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
