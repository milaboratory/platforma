import {
  BlockModelV3,
  DataModelBuilder,
  type InferHrefType,
  type InferOutputsType,
  type PObjectId,
} from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-pframes-oom.kind";

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
    if (!Number.isInteger(rows) || rows < 1 || rows > 100000) {
      throw new Error("Rows must be an integer between 1 and 100000.");
    }
    // Both columns share a constant group, but have independent item axes.
    // N + N input records therefore produce N² joined records in native pframes.
    // A fresh domain prevents a repeated run from reusing a cached result.
    const columns = ["left", "right"].map((side) => ({
      id: `oom-${side}` as PObjectId,
      spec: {
        kind: "PColumn" as const,
        name: `oom/${side}`,
        valueType: "Int" as const,
        axesSpec: [
          { name: "oom/group", type: "Int" as const, domain: { run: String(runId) } },
          { name: `oom/${side}`, type: "Int" as const },
        ],
      },
      data: Array.from({ length: rows }, (_, i) => ({ key: [0, i], val: rows - i })),
    }));
    const handle = ctx.createPTable({
      src: { type: "inner", entries: columns.map((column) => ({ type: "column", column })) },
      partitionFilters: [],
      filters: [],
      // Sorting forces consumption of the join even when the UI requests only its shape.
      sorting: columns.map(({ id }) => ({
        column: { type: "column", id },
        ascending: true,
        naAndAbsentAreLeastValues: true,
      })),
    });
    return handle ? { handle, rows, runId } : undefined;
  })
  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
