import {
  BlockModelV3,
  DATA_MODEL_DEFAULT_VERSION,
  DataModelBuilder,
  type InferHrefType,
  type InferOutputsType,
} from "@platforma-sdk/model";

export type BlockData = {
  titleArgs: string;
};

export type BlockArgs = BlockData;

const dataModel = new DataModelBuilder()
  .from<BlockData>(DATA_MODEL_DEFAULT_VERSION)
  .init(() => ({ titleArgs: "The title" }));

export const platforma = BlockModelV3.create(dataModel)

  .args<BlockArgs>((data) => {
    return { titleArgs: data.titleArgs };
  })

  .output("allSpecs", (ctx) => ctx.resultPool.getSpecs())

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .title((_ctx) => "Pool explorer")

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
