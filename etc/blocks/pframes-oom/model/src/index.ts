import {
  BlockModelV3,
  DataModelBuilder,
  type InferHrefType,
  type InferOutputsType,
} from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-pframes-oom.kind";
import {
  MAX_INLINE_TEXT_CHARS,
  createHeapStressTableDefinition,
  createOomTableDefinition,
  heapStressEstimate,
} from "./table";

/** Re-exported so the UI can warn about an over-budget input before the model rejects it. */
export { MAX_INLINE_TEXT_CHARS } from "./table";

export type BlockData = {
  /** Records per side of the native quadratic join. */
  rows: number;
  /** Records on the text side of the heap join. */
  textRows: number;
  /** Records on the integer side of the heap join. */
  intRows: number;
  /** Characters per string value in the heap join. */
  stringLength: number;
  runId: number;
};

const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(() => ({
  rows: 10000,
  textRows: 200,
  intRows: 10000,
  stringLength: 4000,
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
  .output("heapTable", (ctx) => {
    const { textRows, intRows, stringLength, runId } = ctx.data;
    const params = { textRows, intRows, stringLength, runId };
    const estimate = heapStressEstimate(params);
    // Building the inline data is what would exhaust the model sandbox, and a
    // sandbox death here reports nothing useful about the workload the block
    // exists to exercise. So an over-budget input yields no table at all.
    if (estimate.inlineChars > MAX_INLINE_TEXT_CHARS) return undefined;
    const handle = ctx.createPTable(createHeapStressTableDefinition(params));
    return handle ? { handle, ...params, ...estimate } : undefined;
  })
  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
