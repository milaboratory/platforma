import { describe, expect, it } from "vitest";
import { PluginModel } from "./plugin_model";
import type { PluginRenderCtx } from "./plugin_model";
import { DataModelBuilder, defineDataVersions } from "./block_migrations";
import { DATA_MODEL_DEFAULT_VERSION } from "./block_storage";
import type { ResultPool } from "./render";

// =============================================================================
// Test Fixtures
// =============================================================================

const Version = defineDataVersions({
  V1: DATA_MODEL_DEFAULT_VERSION,
});

type VersionedData = {
  [Version.V1]: { count: number; label: string };
};

type Data = VersionedData[typeof Version.V1];

const dataModelChain = new DataModelBuilder<VersionedData>().from(Version.V1);

// Mock ResultPool for testing
const mockResultPool = {} as ResultPool;

// =============================================================================
// Tests
// =============================================================================

describe("PluginModel", () => {
  it("creates PluginModel with required fields", () => {
    const factory = PluginModel.create<Data>({
      name: "testPlugin",
      dataModelFactory: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    }).build();

    const plugin = factory.create();
    expect(plugin.name).toBe("testPlugin");
    expect(plugin.outputs).toEqual({});
  });

  it("creates PluginModel when calling create() with config", () => {
    type Config = { initialCount: number };

    const factory = PluginModel.create<Data, undefined, Config>({
      name: "factoryPlugin",
      dataModelFactory: (cfg) =>
        dataModelChain.init(() => ({ count: cfg.initialCount, label: "initialized" })),
    }).build();

    const plugin = factory.create({ initialCount: 100 });
    expect(plugin.name).toBe("factoryPlugin");
    expect(plugin.dataModel.initialData()).toEqual({ count: 100, label: "initialized" });
  });

  it("adds single output", () => {
    const factory = PluginModel.create<Data, { multiplier: number }>({
      name: "singleOutput",
      dataModelFactory: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    })
      .output("doubled", (ctx) => ctx.data.count * ctx.params.multiplier)
      .build();

    const plugin = factory.create();
    expect(Object.keys(plugin.outputs)).toEqual(["doubled"]);
  });

  it("accumulates multiple outputs", () => {
    const factory = PluginModel.create<Data, { prefix: string }>({
      name: "multiOutput",
      dataModelFactory: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    })
      .output("formattedCount", (ctx) => `${ctx.params.prefix}${ctx.data.count}`)
      .output("upperLabel", (ctx) => ctx.data.label.toUpperCase())
      .output("isReady", (ctx) => ctx.data.count > 0)
      .build();

    const plugin = factory.create();
    expect(Object.keys(plugin.outputs).sort()).toEqual(["formattedCount", "isReady", "upperLabel"]);
  });

  it("executes output functions with correct context", () => {
    const factory = PluginModel.create<Data, { factor: number }>({
      name: "contextTest",
      dataModelFactory: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    })
      .output("computed", (ctx) => ctx.data.count * ctx.params.factor)
      .build();

    const plugin = factory.create();

    const ctx: PluginRenderCtx<Data, { factor: number }> = {
      data: { count: 5, label: "" },
      params: { factor: 3 },
      resultPool: mockResultPool,
    };

    const result = plugin.outputs.computed(ctx);
    expect(result).toBe(15);
  });

  it("allows outputs to access resultPool", () => {
    const factory = PluginModel.create<Data>({
      name: "resultPoolTest",
      dataModelFactory: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    })
      .output("hasResultPool", (ctx) => ctx.resultPool !== undefined)
      .build();

    const plugin = factory.create();

    const ctx: PluginRenderCtx<Data> = {
      data: { count: 0, label: "" },
      params: undefined,
      resultPool: mockResultPool,
    };

    expect(plugin.outputs.hasResultPool(ctx)).toBe(true);
  });

  it("returns valid PluginModel from factory.create()", () => {
    const factory = PluginModel.create<Data, { items: string[] }, { option: boolean }>({
      name: "completePlugin",
      dataModelFactory: () => dataModelChain.init(() => ({ count: -1, label: "" })),
    })
      .output("currentItem", (ctx) => ctx.params.items[ctx.data.count])
      .output("hasSelection", (ctx) => ctx.data.count >= 0)
      .build();

    const plugin = factory.create({ option: true });
    expect(plugin.name).toBe("completePlugin");
    expect(Object.keys(plugin.outputs).sort()).toEqual(["currentItem", "hasSelection"]);
  });

  it("allows creating plugin without outputs", () => {
    const factory = PluginModel.create<Data>({
      name: "noOutputs",
      dataModelFactory: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    }).build();

    const plugin = factory.create();
    expect(plugin.outputs).toEqual({});
  });

  it("passes config to data model factory for initialization", () => {
    type Config = { defaultCount: number; defaultLabel: string };

    const factory = PluginModel.create<Data, undefined, Config>({
      name: "configInitPlugin",
      dataModelFactory: (cfg) =>
        dataModelChain.init(() => ({ count: cfg.defaultCount, label: cfg.defaultLabel })),
    }).build();

    const plugin = factory.create({ defaultCount: 10, defaultLabel: "default" });
    expect(plugin.dataModel.initialData()).toEqual({ count: 10, label: "default" });
  });

  it("does not modify original builder when chaining", () => {
    const basePlugin = PluginModel.create<Data>({
      name: "immutableTest",
      dataModelFactory: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    });

    const pluginWithOutput1 = basePlugin.output("first", (ctx) => ctx.data.count);
    const pluginWithOutput2 = basePlugin.output("second", (ctx) => ctx.data.count * 2);

    const factory1 = pluginWithOutput1.build();
    const factory2 = pluginWithOutput2.build();

    const plugin1 = factory1.create(undefined);
    const plugin2 = factory2.create(undefined);

    expect(Object.keys(plugin1.outputs)).toEqual(["first"]);
    expect(Object.keys(plugin2.outputs)).toEqual(["second"]);
  });
});
