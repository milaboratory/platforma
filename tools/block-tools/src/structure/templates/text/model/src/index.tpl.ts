import type { InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";
import type { BlockParams } from "${kindPkg}";
import { kind } from "${kindPkg}";

export type BlockData = BlockParams;

const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .init(({ params }) => params ?? {});

export const platforma = BlockModelV3.create({ dataModel, kind })
  .args(() => ({}))
  .templateParams(() => ({}))
  .sections(() => [{ type: "link", href: "/", label: "Main" }])
  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
