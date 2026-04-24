import {
  BlockModelV3,
  DataModelBuilder,
  PObjectId,
  PlDataTableFilters,
  createPlDataTableStateV2,
  createPlDataTableV3,
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
        label: "Table V3",
      },
    ];
  })

  .title((ctx) => ctx.args?.label || "Table Test")

  .outputWithStatus("tableV3", (ctx) => {
    return createPlDataTableV3(ctx, {
      tableState: ctx.data.tableState,

      columns: {
        anchors: {
          main: {
            name: "value",
            axes: [{ name: "name" }],
          },
        },
        selector: {
          mode: "enrichment",
          maxHops: 4,
        },
      },

      sorting: [
        {
          column: {
            type: "column",
            id: '{"name":"value","resolvePath":["main","tableFrame"]}' as PObjectId,
          },
          ascending: true,
          naAndAbsentAreLeastValues: true,
        },
      ],
      filters: {
        type: "and",
        filters: [
          {
            type: "greaterThan",
            column:
              '{"type":"column","id":"{\\"name\\":\\"value\\",\\"resolvePath\\":[\\"main\\",\\"tableFrame\\"]}"}',
            x: 11,
          },
        ],
      } as PlDataTableFilters,

      labelsOptions: {
        // Custom linker label formatter to verify linker path labels in the UI.
        // Default would produce "via L1 > L2"; this makes it "[L1 > L2]" for easy visual identification.
        linkerLabelFormatter: (linkerLabels) => `[${linkerLabels.join(" > ")}]`,
      },
      displayOptions: {
        ordering: [
          // "category" leftmost (highest priority)
          { match: (spec) => spec.name === "category", priority: 20 },
          // Then "value"
          { match: (spec) => spec.name === "value", priority: 10 },
          // Unmatched columns (score, note) keep their original order
        ],
        visibility: [
          // "note" hidden by default (user can re-enable in UI)
          { match: (spec) => spec.name === "note", visibility: "hidden" },
          // "score" optional — hidden by default but toggleable
          { match: (spec) => spec.name === "score", visibility: "optional" },
        ],
      },
    });
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
