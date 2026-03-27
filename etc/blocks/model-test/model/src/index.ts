import {
  BlockModelV3,
  DataModelBuilder,
  PluginModel,
  createPlDataTable,
  createPlDataTableStateV2,
  type PlDataTableStateV2,
  type PluginName,
  type InferHrefType,
  type InferOutputsType,
  type InferPluginNames,
} from "@platforma-sdk/model";

// =============================================================================
// Block Data Model
// =============================================================================

export type BlockData = {
  titleArg: string;
  subtitleArg: string;
  badgeArg: string;
  tagToWorkflow: string;
  tagArgs: string[];
  tableState: PlDataTableStateV2;
};

const blockDataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
  titleArg: "The title",
  subtitleArg: "The subtitle",
  badgeArg: "The badge",
  tagToWorkflow: "workflow-tag",
  tagArgs: [],
  tableState: createPlDataTableStateV2(),
}));

export type BlockArgs = BlockData;

// =============================================================================
// Counter Plugin
// =============================================================================

export type CounterPluginData = {
  count: number;
  lastIncrement: string | undefined;
};

type CounterPluginParams = {
  title: string;
};

type CounterPluginConfig = {
  defaultCount: number;
};

const counterDataModelChain = new DataModelBuilder().from<CounterPluginData>("v1");

export const counterPlugin = PluginModel.define({
  name: "counterPlugin" as PluginName,
  featureFlags: {
    requiresPFrameSpec: true,
    requiresPFrame: true,
  },
  data: (config?: CounterPluginConfig) => {
    const defaultCount = config?.defaultCount ?? 0;
    return counterDataModelChain.init(() => ({
      count: defaultCount,
      lastIncrement: undefined,
    }));
  },
})
  .params<CounterPluginParams>()
  .output("displayText", (ctx) => {
    return `${ctx.params.title}: Count is ${ctx.data.count}`;
  })
  .output("count", (ctx) => {
    return ctx.data.count;
  })
  .output("isEven", (ctx) => {
    return ctx.data.count % 2 === 0;
  })
  .output("specFrameTest", (ctx) => {
    const handle = ctx.services.pframeSpec.createSpecFrame({});
    ctx.services.pframeSpec.disposeSpecFrame(handle);
    return `specFrame: created and disposed`;
  })
  .output("pframeTest", (ctx) => {
    const handle = ctx.services.pframe.createPFrame([]);
    return `pframe: created handle ${handle}`;
  })
  .build();

export type CounterPlugin = typeof counterPlugin;

// =============================================================================
// Block Model with Plugin
// =============================================================================

const counter = counterPlugin.create({ pluginId: "counter", config: { defaultCount: 10 } });

export const platforma = BlockModelV3.create(blockDataModel)
  .args<BlockArgs>((data) => data)

  .plugin(counter, {
    title: (ctx) => ctx.data.titleArg || "Test Counter",
  })

  .sections((ctx) => {
    return [
      {
        type: "link",
        href: "/",
        label: "Main",
        badge: ctx.args?.badgeArg,
      },
    ];
  })

  .title((ctx) => (ctx.args?.titleArg || "Title") + " <- the title")

  .subtitle((ctx) => (ctx.args?.subtitleArg || "Subtitle") + " <- the subtitle")

  .tags((ctx) => {
    const result = ["test-tag", "plugin-test", ...(ctx.args?.tagArgs || [])];

    const outputFromTheWorkflow = ctx.outputs?.resolve("theOutput")?.getDataAsJson<string>();
    if (outputFromTheWorkflow) {
      result.push(outputFromTheWorkflow);
    }

    return result;
  })

  .output("delayedOutput", (ctx) => ctx.outputs?.resolve("delayedContent")?.getDataAsString())

  .outputWithStatus("delayedOutputWithStatus", (ctx) =>
    ctx.outputs?.resolve("delayedContent")?.getDataAsString(),
  )

  .output("blockSpecFrameTest", (ctx) => {
    const handle = ctx.services.pframeSpec.createSpecFrame({});
    ctx.services.pframeSpec.disposeSpecFrame(handle);
    return `blockSpecFrame: created and disposed`;
  })

  .outputWithStatus("blockTableTest", (ctx) => {
    return createPlDataTable(ctx, {
      columns: {},
      state: ctx.data.tableState,
    });
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
export type PluginNames = InferPluginNames<typeof platforma>;
