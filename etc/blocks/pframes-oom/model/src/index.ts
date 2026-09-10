import {
  BlockModelV3,
  DataModelBuilder,
  type InferHrefType,
  type InferOutputsType,
} from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-pframes-oom.kind";
import { createOomTableDefinition } from "./table";

export type BlockData = { rows: number; runId: number };
const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(() => ({
  rows: 10000,
  runId: 0,
}));

export const platforma = BlockModelV3.create({ dataModel, kind })
  .args(() => ({}))
  .templateParams(() => ({}))
  .title(() => "PFrames OOM reproducer")
  .sections(() => [{ type: "link", href: "/", label: "Memory stress" }])
  .output("table", (ctx) => {
    const { rows, runId } = ctx.data;
    const handle = ctx.createPTable(createOomTableDefinition(rows, runId));
    return handle ? { handle, rows, runId } : undefined;
  })
  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
