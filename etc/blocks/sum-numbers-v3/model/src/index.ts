import type { InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import {
  Annotation,
  BlockModelV3,
  DataModelBuilder,
  PlRef,
  readAnnotation,
} from "@platforma-sdk/model";

/**
 * Persistent block state — user input for the sum-numbers-v3 block.
 *
 * Spike probe — JSDoc on the alias and on each property must reach the
 * bundled facade `.d.ts` through `InferDataType<typeof platforma>`.
 */
export type BlockData = {
  /** Refs the user picked as input sources. Empty until at least one is selected. */
  sources?: PlRef[];
};

/**
 * Outcome shape produced by the workflow once the run completes. Returned by
 * the `sum` output lambda so the inferred property of `BlockOutputs` carries
 * this named type and its JSDoc.
 *
 * Spike probe — named return type whose JSDoc must propagate downstream
 * through `InferOutputsType`.
 */
export type SumOutcome = {
  /** Computed sum of all input numbers. */
  sum: number;
  /** Number of input values used. */
  count: number;
};

const dataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({ sources: undefined }));

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

  .output("sum", (ctx): SumOutcome | undefined => {
    const sum = ctx.outputs?.resolve("sum")?.getDataAsJson<number>();
    if (sum === undefined) return undefined;
    return { sum, count: ctx.args?.sources?.length ?? 0 };
  })

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

/**
 * Reference shape exposed by this block — nominal record so downstream blocks
 * can pin against it regardless of future shape changes.
 *
 * Spike probe — JSDoc on a hand-written helper type re-exported through the
 * facade. Both alias-level JSDoc and per-property JSDoc must survive.
 */
export type SumNumbersRef = {
  /** Nominal tag pinning this ref to the sum-numbers-v3 block. */
  readonly kind: "sum-numbers-v3";
  /** Sum value, populated once the workflow run completes. */
  sum: number | undefined;
};
