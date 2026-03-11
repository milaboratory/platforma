import { describe, expect, it } from "vitest";
import {
  PluginModel,
  PluginDataModelBuilder,
  PluginInstance,
  CREATE_PLUGIN_MODEL,
} from "./plugin_model";
import type { PluginRenderCtx } from "./plugin_model";
import { DataModelBuilder } from "./block_migrations";
import { type PluginName, DATA_MODEL_LEGACY_VERSION } from "./block_storage";
import type { ResultPool } from "./render";

type Data = { count: number; label: string };

const dataModelChain = new DataModelBuilder().from<Data>("v1");

// Mock ResultPool for testing
const mockResultPool = {} as ResultPool;

describe("PluginModel", () => {
  it("creates PluginModel with required fields", () => {
    const factory = PluginModel.define<Data>({
      name: "testPlugin" as PluginName,
      data: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    }).build();

    const instance = factory.create({ pluginId: "test" });
    const plugin = instance[CREATE_PLUGIN_MODEL]();
    expect(plugin.name).toBe("testPlugin");
    expect(plugin.outputs).toEqual({});
  });

  it("creates PluginModel when calling create() with config", () => {
    type Config = { initialCount: number };

    const factory = PluginModel.define<Data, undefined, Config>({
      name: "factoryPlugin" as PluginName,
      data: (cfg) => dataModelChain.init(() => ({ count: cfg.initialCount, label: "initialized" })),
    }).build();

    const instance = factory.create({ pluginId: "inst1", config: { initialCount: 100 } });
    const plugin = instance[CREATE_PLUGIN_MODEL]();
    expect(plugin.name).toBe("factoryPlugin");
    expect(plugin.dataModel.initialData()).toEqual({ count: 100, label: "initialized" });
  });

  it("adds single output", () => {
    const factory = PluginModel.define<Data, { multiplier: number }>({
      name: "singleOutput" as PluginName,
      data: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    })
      .output("doubled", (ctx) => ctx.data.count * ctx.params.multiplier)
      .build();

    const instance = factory.create({ pluginId: "inst1" });
    const plugin = instance[CREATE_PLUGIN_MODEL]();
    expect(Object.keys(plugin.outputs)).toEqual(["doubled"]);
  });

  it("accumulates multiple outputs", () => {
    const factory = PluginModel.define<Data, { prefix: string }>({
      name: "multiOutput" as PluginName,
      data: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    })
      .output("formattedCount", (ctx) => `${ctx.params.prefix}${ctx.data.count}`)
      .output("upperLabel", (ctx) => ctx.data.label.toUpperCase())
      .output("isReady", (ctx) => ctx.data.count > 0)
      .build();

    const instance = factory.create({ pluginId: "inst1" });
    const plugin = instance[CREATE_PLUGIN_MODEL]();
    expect(Object.keys(plugin.outputs).sort()).toEqual(["formattedCount", "isReady", "upperLabel"]);
  });

  it("executes output functions with correct context", () => {
    const factory = PluginModel.define<Data, { factor: number }>({
      name: "contextTest" as PluginName,
      data: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    })
      .output("computed", (ctx) => ctx.data.count * ctx.params.factor)
      .build();

    const instance = factory.create({ pluginId: "inst1" });
    const plugin = instance[CREATE_PLUGIN_MODEL]();

    const ctx: PluginRenderCtx<Data, { factor: number }> = {
      data: { count: 5, label: "" },
      params: { factor: 3 },
      resultPool: mockResultPool,
    };

    const result = plugin.outputs.computed(ctx);
    expect(result).toBe(15);
  });

  it("allows outputs to access resultPool", () => {
    const factory = PluginModel.define<Data>({
      name: "resultPoolTest" as PluginName,
      data: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    })
      .output("hasResultPool", (ctx) => ctx.resultPool !== undefined)
      .build();

    const instance = factory.create({ pluginId: "inst1" });
    const plugin = instance[CREATE_PLUGIN_MODEL]();

    const ctx: PluginRenderCtx<Data> = {
      data: { count: 0, label: "" },
      params: undefined,
      resultPool: mockResultPool,
    };

    expect(plugin.outputs.hasResultPool(ctx)).toBe(true);
  });

  it("returns valid PluginModel from factory.create()", () => {
    const factory = PluginModel.define<Data, { items: string[] }, { option: boolean }>({
      name: "completePlugin" as PluginName,
      data: () => dataModelChain.init(() => ({ count: -1, label: "" })),
    })
      .output("currentItem", (ctx) => ctx.params.items[ctx.data.count])
      .output("hasSelection", (ctx) => ctx.data.count >= 0)
      .build();

    const instance = factory.create({ pluginId: "inst1", config: { option: true } });
    const plugin = instance[CREATE_PLUGIN_MODEL]();
    expect(plugin.name).toBe("completePlugin");
    expect(Object.keys(plugin.outputs).sort()).toEqual(["currentItem", "hasSelection"]);
  });

  it("allows creating plugin without outputs", () => {
    const factory = PluginModel.define<Data>({
      name: "noOutputs" as PluginName,
      data: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    }).build();

    const instance = factory.create({ pluginId: "inst1" });
    const plugin = instance[CREATE_PLUGIN_MODEL]();
    expect(plugin.outputs).toEqual({});
  });

  it("passes config to data model factory for initialization", () => {
    type Config = { defaultCount: number; defaultLabel: string };

    const factory = PluginModel.define<Data, undefined, Config>({
      name: "configInitPlugin" as PluginName,
      data: (cfg) =>
        dataModelChain.init(() => ({ count: cfg.defaultCount, label: cfg.defaultLabel })),
    }).build();

    const instance = factory.create({
      pluginId: "inst1",
      config: { defaultCount: 10, defaultLabel: "default" },
    });
    const plugin = instance[CREATE_PLUGIN_MODEL]();
    expect(plugin.dataModel.initialData()).toEqual({ count: 10, label: "default" });
  });

  it("does not modify original builder when chaining", () => {
    const basePlugin = PluginModel.define<Data>({
      name: "immutableTest" as PluginName,
      data: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    });

    const pluginWithOutput1 = basePlugin.output("first", (ctx) => ctx.data.count);
    const pluginWithOutput2 = basePlugin.output("second", (ctx) => ctx.data.count * 2);

    const factory1 = pluginWithOutput1.build();
    const factory2 = pluginWithOutput2.build();

    const plugin1 = factory1.create({ pluginId: "p1" })[CREATE_PLUGIN_MODEL]();
    const plugin2 = factory2.create({ pluginId: "p2" })[CREATE_PLUGIN_MODEL]();

    expect(Object.keys(plugin1.outputs)).toEqual(["first"]);
    expect(Object.keys(plugin2.outputs)).toEqual(["second"]);
  });
});

describe("PluginDataModel", () => {
  it("creates default data via new PluginDataModelBuilder().from().init()", () => {
    type PData = { items: string[] };
    const pdm = new PluginDataModelBuilder().from<PData>("v1").init(() => ({ items: [] }));

    const defaultData = pdm.getDefaultData();
    expect(defaultData.version).toBe("v1");
    expect(defaultData.data).toStrictEqual({ items: [] });
  });

  it("getDefaultData passes config to init function", () => {
    type PData = { items: string[]; count: number };
    type PConfig = { defaultCount: number };

    const pdm = new PluginDataModelBuilder().from<PData>("v1").init<PConfig>((config?) => ({
      items: [],
      count: config?.defaultCount ?? 0,
    }));

    // Without config
    const noConfig = pdm.getDefaultData();
    expect(noConfig.data).toStrictEqual({ items: [], count: 0 });

    // With config
    const withConfig = pdm.getDefaultData({ defaultCount: 42 });
    expect(withConfig.data).toStrictEqual({ items: [], count: 42 });
  });

  it("supports .recover() in the chain", () => {
    type V1 = { value: number };
    type V2 = { value: number; label: string };

    const pdm = new PluginDataModelBuilder()
      .from<V1>("v1")
      .recover((version, data) => {
        if (version === "legacy") return { value: (data as any).val || 0 };
        throw new Error(`Unknown version: ${version}`);
      })
      .migrate<V2>("v2", (v1) => ({ ...v1, label: "recovered" }))
      .init(() => ({ value: 0, label: "" }));

    // Recovery path — test via inner dataModel
    const result = pdm.dataModel.migrate({ version: "legacy", data: { val: 99 } });
    expect(result.version).toBe("v2");
    expect(result.data).toStrictEqual({ value: 99, label: "recovered" });
  });

  it("getDefaultData uses config from PluginDataModel path", () => {
    type PData = { value: number };
    type PConfig = { defaultValue: number };

    const pdm = new PluginDataModelBuilder()
      .from<PData>("v1")
      .init<PConfig>((config?) => ({ value: config?.defaultValue ?? 0 }));

    const factory = PluginModel.define({
      name: "pdmTest" as PluginName,
      data: pdm,
    }).build();

    const plugin = factory
      .create({ pluginId: "inst1", config: { defaultValue: 42 } })
      [CREATE_PLUGIN_MODEL]();
    expect(plugin.getDefaultData().data).toStrictEqual({ value: 42 });
  });

  it("getDefaultData works for function-based data", () => {
    const factory = PluginModel.define<Data>({
      name: "fnTest" as PluginName,
      data: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    }).build();

    const plugin = factory.create({ pluginId: "inst1" })[CREATE_PLUGIN_MODEL]();
    expect(plugin.getDefaultData().data).toStrictEqual({ count: 0, label: "" });
  });

  it("upgradeLegacy allows migrating from DATA_MODEL_LEGACY_VERSION", () => {
    type V1 = { value: number };
    type V2 = { value: number; extra: string };

    const pdm = new PluginDataModelBuilder()
      .from<V1>("v1")
      .upgradeLegacy((data) => ({ value: (data as any).oldValue ?? 0 }))
      .migrate<V2>("v2", (v1) => ({ ...v1, extra: "added" }))
      .init(() => ({ value: 0, extra: "" }));

    // Legacy path: data arrives with DATA_MODEL_LEGACY_VERSION
    const result = pdm.dataModel.migrate({
      version: DATA_MODEL_LEGACY_VERSION,
      data: { oldValue: 42 },
    });
    expect(result.version).toBe("v2");
    expect(result.data).toStrictEqual({ value: 42, extra: "added" });
  });

  it("upgradeLegacy is not needed for normal version migration", () => {
    type V1 = { value: number };
    type V2 = { value: number; extra: string };

    const pdm = new PluginDataModelBuilder()
      .from<V1>("v1")
      .upgradeLegacy((data) => ({ value: (data as any).oldValue ?? 0 }))
      .migrate<V2>("v2", (v1) => ({ ...v1, extra: "added" }))
      .init(() => ({ value: 0, extra: "" }));

    // Normal migration: v1 → v2
    const result = pdm.dataModel.migrate({
      version: "v1",
      data: { value: 10 },
    });
    expect(result.version).toBe("v2");
    expect(result.data).toStrictEqual({ value: 10, extra: "added" });
  });
});

describe("PluginInstance", () => {
  it("factory.create() returns a PluginInstance with correct id", () => {
    const factory = PluginModel.define<Data>({
      name: "instanceTest" as PluginName,
      data: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    }).build();

    const instance = factory.create({ pluginId: "myTable" });
    expect(instance).toBeInstanceOf(PluginInstance);
    expect(instance.id).toBe("myTable");
  });

  it("PluginInstance[CREATE_PLUGIN_MODEL]() delegates to factory", () => {
    type Config = { initial: number };
    const factory = PluginModel.define<Data, undefined, Config>({
      name: "delegateTest" as PluginName,
      data: (cfg) => dataModelChain.init(() => ({ count: cfg.initial, label: "" })),
    }).build();

    const instance = factory.create({ pluginId: "inst1", config: { initial: 42 } });
    const plugin = instance[CREATE_PLUGIN_MODEL]();
    expect(plugin.name).toBe("delegateTest");
    expect(plugin.dataModel.initialData()).toStrictEqual({ count: 42, label: "" });
  });

  it("PluginInstance without transferAt has empty transferVersion", () => {
    const factory = PluginModel.define<Data>({
      name: "noTransfer" as PluginName,
      data: () => dataModelChain.init(() => ({ count: 0, label: "" })),
    }).build();

    const instance = factory.create({ pluginId: "inst1" });
    expect(instance.transferVersion).toBe("");
  });

  it("PluginInstance with transferAt has correct transferVersion", () => {
    type V1 = { value: number };
    type V2 = { value: number; label: string };
    const pdm = new PluginDataModelBuilder()
      .from<V1>("v1")
      .migrate<V2>("v2", (v1) => ({ ...v1, label: "" }))
      .init(() => ({ value: 0, label: "" }));

    const factory = PluginModel.define({
      name: "withTransfer" as PluginName,
      data: pdm,
    }).build();

    const instance = factory.create({ pluginId: "inst1", transferAt: "v1" });
    expect(instance.transferVersion).toBe("v1");
  });

  it("config is captured in getDefaultData closure", () => {
    type PData = { items: string[]; count: number };
    type PConfig = { defaultCount: number };

    const pdm = new PluginDataModelBuilder().from<PData>("v1").init<PConfig>((config?) => ({
      items: [],
      count: config?.defaultCount ?? 0,
    }));

    const factory = PluginModel.define({
      name: "configStore" as PluginName,
      data: pdm,
    }).build();

    const instance = factory.create({ pluginId: "inst1", config: { defaultCount: 99 } });
    const plugin = instance[CREATE_PLUGIN_MODEL]();
    expect(plugin.getDefaultData().data).toStrictEqual({ items: [], count: 99 });
  });
});
