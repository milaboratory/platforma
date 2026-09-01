import type {
  DatasetSelection,
  LabeledEnrichmentRefs,
  InferHrefType,
  InferOutputsType,
  PObjectSpec,
  PrimaryRef,
} from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder, buildDatasetOptions } from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-filter-column.kind";
import * as v from "valibot";

export const BlockData = v.object({
  dataset: v.optional(v.custom<DatasetSelection>(() => true)),
});

export type BlockData = v.InferOutput<typeof BlockData>;

// The kind declares no init params — `dataset` is always picked in the UI — so
// `init` takes no `params` and a fresh block starts with an unset selection.
const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(() => ({}));

const PRIMARY_NAMES = new Set(["value", "description"]);
const isPrimaryColumn = (spec: PObjectSpec): boolean =>
  spec.kind === "PColumn" && PRIMARY_NAMES.has(spec.name);

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args<{ dataset: PrimaryRef; enrichments: LabeledEnrichmentRefs }>((data) => {
    if (data.dataset === undefined) throw new Error("Select a dataset");
    return {
      dataset: data.dataset.primary,
      enrichments: data.dataset.enrichments ?? [],
    };
  })

  // Nothing to project: the kind takes no params. This fixture exists to exercise
  // dataset selection end-to-end, so the selection is always made in the UI.
  .templateParams(() => ({}))

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
