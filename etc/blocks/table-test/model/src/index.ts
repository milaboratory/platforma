import {
  BlockModelV3,
  DataModelBuilder,
  createPlDataTableStateV2,
  createPlDataTableV2,
  type InferHrefType,
  type InferOutputsType,
  type PlDataTableStateV2,
} from "@platforma-sdk/model";

export type BlockData = {
  label: string;
  tableState: PlDataTableStateV2;
};

const blockDataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
  label: "Table Test",
  tableState: createPlDataTableStateV2(),
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

  .outputWithStatus("table", (ctx) => {
    const pf = ctx.outputs?.resolve("tableFrame");
    if (!pf) return undefined;

    const columns = pf.getPColumns();
    if (!columns || columns.length === 0) return undefined;

    return createPlDataTableV2(ctx, columns, ctx.data.tableState);
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
