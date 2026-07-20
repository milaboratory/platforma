import {
  BlockModelV3,
  ColumnUniversalId,
  ColumnsCollection,
  DataModelBuilder,
  PlDataTableFilters,
  createPlDataTableStateV2,
  createPlDataTableV3,
  deriveAxisValuesLabels,
  expandByPartition,
  isColumnLazy,
  type InferHrefType,
  type InferOutputsType,
  type PlDataTableStateV2,
} from "@platforma-sdk/model";

export type BlockData = {
  label: string;
  tableState: PlDataTableStateV2;
  tableSplitState: PlDataTableStateV2;
};

const blockDataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
  label: "Table Test",
  tableState: createPlDataTableStateV2(),
  tableSplitState: createPlDataTableStateV2(),
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
      {
        type: "link",
        href: "/split",
        label: "Table Split",
      },
    ];
  })

  .title((ctx) => ctx.args?.label || "Table Test")

  .outputWithStatus("tableV3", (ctx) => {
    const valueAnchor = { name: "value", axes: [{ name: "name" }] };

    // Intended way to reference a column for sorting/filtering: discover it and
    // read the id off the recipe. Real blocks never hardcode the id literal —
    // they pull it from the same collection the table is built from.
    const valueColumn = ColumnsCollection()
      .discover({ anchors: { main: valueAnchor }, mode: "exact" })
      .getColumns()
      .find((c) => c.getSpec().name === "value");
    if (valueColumn === undefined) return undefined;

    return createPlDataTableV3(ctx, {
      tableState: ctx.data.tableState,

      columns: {
        anchors: { main: valueAnchor },
        selector: {
          mode: "enrichment",
          maxHops: 4,
        },
      },

      sorting: [
        {
          column: {
            type: "column",
            id: valueColumn.id,
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
            column: {
              type: "column",
              id: valueColumn.id,
            },
            x: 11,
          },
        ],
      } as PlDataTableFilters,

      labelsOptions: {
        // Custom linker postfix formatter to verify linker path labels in the UI.
        // Default would produce "via <root> L1 > L2"; this makes it "[root, L1, L2]" for easy visual
        // identification. Each piece carries its full spec plus the computed distinguishing `text`.
        formatters: {
          linker: ({ root, linkers }) =>
            `[${[root?.text, ...linkers.map((l) => l.text)].filter(Boolean).join(" > ")}]`,
        },
      },
      displayOptions: {
        ordering: [
          // "category" leftmost (highest priority)
          { match: { name: "^category$" }, priority: 20 },
          // Then "value"
          { match: { name: "^value$" }, priority: 10 },
          // Unmatched columns (score, note) keep their original order
        ],
        visibility: [
          // "note" hidden by default (user can re-enable in UI)
          { match: { name: "^note$" }, visibility: "hidden" },
          // "score" optional — hidden by default but toggleable
          { match: { name: "^score$" }, visibility: "optional" },
        ],
      },
    });
  })

  // Same `value`/`name` anchor as tableV3, but with extra columns produced by
  // splitting the `count` (group, name) column on its `group` axis: each group
  // value becomes its own ColumnOverriddenRecipe in `columns`, joining onto the
  // primary on the shared `name` axis.
  .outputWithStatus("tableSplitV3", (ctx) => {
    const valueAnchor = { name: "value", axes: [{ name: "name" }] };

    // Use only leaf (ColumnLazy) hits as primary. `discover` with anchors can
    // also surface multi-axis Discovered variants (e.g. count [group, name]
    // reached via linker_name_group_alt); those belong in secondary, not in
    // the join's primary side — mirrors what `discoverTableColumns` does
    // internally for the selector-form path.
    const primary = ColumnsCollection()
      .discover({ anchors: { main: valueAnchor }, mode: "exact" })
      .getColumns()
      .filter(isColumnLazy);
    if (primary.length === 0) return undefined;

    const countLeaves = ColumnsCollection()
      .filter({ include: { name: [{ type: "exact", value: "count" }] } })
      .getColumns()
      .filter(isColumnLazy);

    const splitRecipes = expandByPartition(countLeaves, [{ idx: 0 }], {
      axisValuesLabels: deriveAxisValuesLabels(),
    });
    if (splitRecipes === undefined) return undefined;

    const primaryIds = new Set<ColumnUniversalId>(primary.map((c) => c.id));
    const secondary = ColumnsCollection()
      .discover({ anchors: { main: valueAnchor }, mode: "enrichment", maxHops: 4 })
      .getColumns()
      .filter((c) => !primaryIds.has(c.id));

    return createPlDataTableV3(ctx, {
      primaryColumns: primary,
      columns: [...secondary, ...splitRecipes],

      tableState: ctx.data.tableSplitState,
      labelsOptions: {
        formatters: {
          linker: ({ root, linkers }) =>
            `[${[root?.text, ...linkers.map((l) => l.text)].filter(Boolean).join(" > ")}]`,
        },
      },
    });
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
