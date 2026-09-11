import type { InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import {
  Annotation,
  BlockModelV3,
  DataModelBuilder,
  PlRef,
  readAnnotation,
} from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-sum-numbers.kind";
import * as v from "valibot";

export const BlockData = v.object({
  sources: v.optional(v.array(PlRef)),
});

export type BlockData = v.InferOutput<typeof BlockData>;

// `params` is optional — a block may be created without a template supplying
// them — so every kind-declared field keeps a fallback default.
const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .init(({ params }) => ({ sources: params?.sources ?? undefined }));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args<BlockData>((data) => {
    if (data.sources === undefined || data.sources.length === 0) {
      throw new Error("Sources are required");
    }
    return { sources: data.sources };
  })

  .prerunArgs((data) => {
    return { sources: data.sources ?? [] };
  })

  .templateParams((data) => ({ sources: data.sources }))

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
