import type { InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "${kindPkg}";

export type BlockArgs = Record<string, never>;

const dataModel = new DataModelBuilder({ kind }).from<BlockArgs>("v1").init(() => ({}));

export const platforma = BlockModelV3.create({ dataModel, kind })
  .args(() => ({}))
  .sections(() => [{ type: "link", href: "/", label: "Main" }])
  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
