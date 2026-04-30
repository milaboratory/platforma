import type {
  DatasetSelection,
  LabeledEnrichmentRefs,
  InferHrefType,
  InferOutputsType,
  PObjectSpec,
  PrimaryRef,
} from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder, buildDatasetOptions } from "@platforma-sdk/model";
import { z } from "zod";

export const BlockData = z.object({
  dataset: z.custom<DatasetSelection>().optional(),
});

export type BlockData = z.infer<typeof BlockData>;

const dataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({}));

const PRIMARY_NAMES = new Set(["value", "description"]);
const isPrimaryColumn = (spec: PObjectSpec): boolean =>
  spec.kind === "PColumn" && PRIMARY_NAMES.has(spec.name);

export const platforma = BlockModelV3.create(dataModel)

  .args<{ dataset: PrimaryRef; enrichments: LabeledEnrichmentRefs }>((data) => {
    if (data.dataset === undefined) throw new Error("Select a dataset");
    return {
      dataset: data.dataset.primary,
      enrichments: data.dataset.enrichments ?? [],
    };
  })

  .output("datasetOptions", (ctx) =>
    buildDatasetOptions(ctx, { primary: isPrimaryColumn, withEnrichments: () => true }),
  )

  .output("tableContent", (ctx) => ctx.outputs?.resolve("tableFile")?.getFileContentAsString())

  .output("tableContentLinker", (ctx) =>
    ctx.outputs?.resolve("tableFileLinker")?.getFileContentAsString(),
  )

  .sections((_ctx) => [{ type: "link", href: "/", label: "Main" }])

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
