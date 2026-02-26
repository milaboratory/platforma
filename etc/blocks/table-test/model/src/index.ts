import {
  BlockModelV3,
  DataModelBuilder,
  type InferHrefType,
  type InferOutputsType,
} from "@platforma-sdk/model";

export type BlockData = {
  label: string;
};

const blockDataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
  label: "Table Test",
}));

export type BlockArgs = BlockData;

export const platforma = BlockModelV3.create(blockDataModel)
  .args<BlockArgs>((data) => data)

  .sections(() => {
    return [
      {
        type: "link",
        href: "/",
        label: "Main",
      },
    ];
  })

  .title((ctx) => ctx.args?.label || "Table Test")

  .output("tableContent", (ctx) => ctx.outputs?.resolve("tableContent")?.getDataAsString())

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
