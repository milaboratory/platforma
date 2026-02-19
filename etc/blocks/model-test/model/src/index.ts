import {
  BlockModelV3,
  DataModelBuilder,
  PluginModel,
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
};

const blockDataModel = new DataModelBuilder().from<BlockData>("v1").init(() => ({
  titleArg: "The title",
  subtitleArg: "The subtitle",
  badgeArg: "The badge",
  tagToWorkflow: "workflow-tag",
  tagArgs: [],
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

const counterDataModelChain = new DataModelBuilder().from<CounterPluginData>("v1");

const counterPlugin = PluginModel.define<
  CounterPluginData,
  CounterPluginParams,
  { defaultCount: number }
>({
  name: "counterPlugin" as PluginName,
  dataModelFactory: (config) => {
    const defaultCount = config?.defaultCount ?? 0;
    return counterDataModelChain.init(() => ({
      count: defaultCount,
      lastIncrement: undefined,
    }));
  },
})
  .output("displayText", (ctx) => {
    return `${ctx.params.title}: Count is ${ctx.data.count}`;
  })
  .output("count", (ctx) => {
    return ctx.data.count;
  })
  .output("isEven", (ctx) => {
    return ctx.data.count % 2 === 0;
  })
  .build();

// =============================================================================
// Block Model with Plugin
// =============================================================================

export const platforma = BlockModelV3.create(blockDataModel)
  .args<BlockArgs>((data) => data)

  .plugin("counter", counterPlugin.create({ defaultCount: 10 }), {
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

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
export type PluginNames = InferPluginNames<typeof platforma>;
