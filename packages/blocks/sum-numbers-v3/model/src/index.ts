import type { InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import {
  Annotation,
  BlockModelV3,
  DATA_MODEL_DEFAULT_VERSION,
  DataModelBuilder,
  PlRef,
  readAnnotation,
} from "@platforma-sdk/model";
import { z } from "zod";

export const BlockData = z.object({
  sources: z.array(PlRef).optional(),
});

export type BlockData = z.infer<typeof BlockData>;

const dataModel = new DataModelBuilder()
  .from<BlockData>(DATA_MODEL_DEFAULT_VERSION)
  .init(() => ({ sources: undefined }));

export const platforma = BlockModelV3.create(dataModel)

  .args<BlockData>((data) => {
    if (data.sources === undefined || data.sources.length === 0) {
      throw new Error("Sources are required");
    }
    return { sources: data.sources };
  })

  .prerunArgs((data) => {
    return { sources: data.sources ?? [] };
  })

  .output("opts", (ctx) =>
    ctx.resultPool
      .getSpecs()
      .entries.filter((spec) => {
        if (spec.obj.annotations === undefined) return false;
        return readAnnotation(spec.obj, Annotation.Label) == "Numbers";
      })
      .map((opt, i) => ({
        label: `numbers_${i}`,
        value: opt.ref,
      })),
  )

  .output("optsWithEnrichments", (ctx) =>
    ctx.resultPool
      .getSpecs()
      .entries.filter((spec) => {
        if (spec.obj.annotations === undefined) return false;
        return readAnnotation(spec.obj, Annotation.Label) == "Numbers";
      })
      .map((opt, i) => ({
        label: `numbers_${i}`,
        value: { ...opt.ref, requireEnrichment: true },
      })),
  )

  .output("sum", (ctx) => ctx.outputs?.resolve("sum")?.getDataAsJson<number>())

  .output("prerunArgsJson", (ctx) =>
    ctx.prerun?.resolve("prerunArgsJson")?.getDataAsJson<Record<string, unknown>>(),
  )

  .enriches((args) =>
    args.sources !== undefined && args.sources.length > 0 ? [args.sources[0]] : [],
  )

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
