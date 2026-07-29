import {
  BlockModelV3,
  DataModelBuilder,
  type InferHrefType,
  type InferOutputsType,
} from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.pool-explorer.kind";

/**
 * Pool Explorer persists nothing: the page renders whatever the result pool
 * currently exposes, and its filter controls are local Vue state. The kind's
 * `BlockParams` is empty for the same reason, so `init` takes no params.
 */
export type BlockData = Record<string, never>;

export type BlockArgs = BlockData;

const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(() => ({}));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args<BlockArgs>(() => ({}))

  .output("allSpecs", (ctx) => ctx.resultPool.getSpecs())

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .title((_ctx) => "Pool explorer")

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
