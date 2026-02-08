import {
  BlockModelV3,
  DATA_MODEL_DEFAULT_VERSION,
  DataModelBuilder,
  defineDataVersions,
  type InferHrefType,
  type InferOutputsType,
} from "@platforma-sdk/model";

export type BlockData = {
  titleArgs: string;
};

export type BlockArgs = BlockData;

const Version = defineDataVersions({ V1: DATA_MODEL_DEFAULT_VERSION });

type VersionedData = { [Version.V1]: BlockData };

const dataModel = new DataModelBuilder<VersionedData>()
  .from(Version.V1)
  .init(() => ({ titleArgs: "The title" }));

export const platforma = BlockModelV3.create({ dataModel, renderingMode: "Heavy" })

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
