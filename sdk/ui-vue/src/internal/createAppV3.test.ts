import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAppV3, patchPoolingDelay } from "./createAppV3";
import {
  type OutputWithStatus,
  type BlockStateV3,
  type NavigationState,
  type AuthorMarker,
  type ResultOrError,
  type ValueWithUTag,
  type ValueWithUTagAndAuthor,
  type MutateStoragePayload,
  type PlatformaExtended,
  type PlatformaV3,
  type BlockModelInfo,
  type PluginHandle,
  createBlockStorage,
  updateStorageData,
  wrapAsyncCallback,
  pluginOutputKey,
  type PluginFactory,
} from "@platforma-sdk/model";
import { deepClone, delay, uniqueId } from "@milaboratories/helpers";
import { compare, type Operation } from "fast-json-patch";

// =============================================================================
// Types
// =============================================================================

type Data = {
  count: number;
  label: string;
};

type Args = Data;

type Outputs = {
  doubled: OutputWithStatus<number>;
};

type PluginData = {
  value: number;
};

// =============================================================================
// V3 Block Mock
// =============================================================================

class BlockStateV3Mock<
  D = unknown,
  O extends Record<string, OutputWithStatus<unknown>> = Record<string, OutputWithStatus<unknown>>,
  Href extends `/${string}` = `/${string}`,
> {
  blockStorage: ReturnType<typeof createBlockStorage>;
  outputs: O;
  href: Href;
  author: AuthorMarker;
  uTag: string;

  constructor(data: D, outputs: O, href: Href, plugins?: Record<string, unknown>) {
    const storage = createBlockStorage(data);
    if (plugins) {
      // Add plugin entries to storage
      let s = storage as ReturnType<typeof createBlockStorage>;
      for (const handle of Object.keys(plugins) as PluginHandle[]) {
        s = updateStorageData(s, {
          operation: "update-plugin-data",
          pluginId: handle,
          value: plugins[handle],
        });
      }
      this.blockStorage = s;
    } else {
      this.blockStorage = storage;
    }
    this.outputs = outputs;
    this.href = href;
    this.author = { authorId: "test", localVersion: 0 };
    this.uTag = uniqueId();
  }

  getState(): BlockStateV3<D, O, Href> {
    return deepClone({
      blockStorage: this.blockStorage,
      outputs: this.outputs,
      navigationState: { href: this.href },
      author: this.author,
    }) as unknown as BlockStateV3<D, O, Href>;
  }

  mutateStorage(payload: MutateStoragePayload, author?: AuthorMarker) {
    this.blockStorage = updateStorageData(this.blockStorage, payload);
    if (author) this.author = author;
    this.uTag = uniqueId();
  }

  setOutputs(outputs: Partial<O>) {
    this.outputs = { ...this.outputs, ...outputs };
    this.uTag = uniqueId();
  }

  setNavigationState(state: NavigationState<Href>) {
    this.href = state.href;
    this.uTag = uniqueId();
  }
}

function createMockApiV3<
  D,
  A,
  O extends Record<string, OutputWithStatus<unknown>>,
  Href extends `/${string}` = `/${string}`,
  Plugins extends Record<string, unknown> = Record<string, unknown>,
>(
  state: BlockStateV3Mock<D, O, Href>,
  blockModelInfo: BlockModelInfo,
): PlatformaExtended<PlatformaV3<D, A, O, Href, Plugins>> {
  let previousState: { uTag: string; value: BlockStateV3<D, O, Href> } | undefined;

  // Initialize previous state
  const initial = state.getState();
  previousState = { uTag: state.uTag, value: initial };

  return {
    apiVersion: 3,
    sdkInfo: { sdkVersion: "dev" },
    blockModelInfo,
    async loadBlockState(): Promise<ResultOrError<ValueWithUTag<BlockStateV3<D, O, Href>>>> {
      return wrapAsyncCallback(async () => {
        const value = state.getState();
        previousState = { uTag: state.uTag, value: deepClone(value) as BlockStateV3<D, O, Href> };
        return { uTag: state.uTag, value };
      });
    },
    async getPatches(uTag: string): Promise<ResultOrError<ValueWithUTagAndAuthor<Operation[]>>> {
      return wrapAsyncCallback(async () => {
        while (uTag === state.uTag) {
          await delay(0);
        }
        const currentValue = state.getState();
        const patches = compare((previousState?.value ?? {}) as object, currentValue as object);
        previousState = {
          uTag: state.uTag,
          value: deepClone(currentValue) as BlockStateV3<D, O, Href>,
        };
        return {
          uTag: state.uTag,
          value: patches,
          author: state.author,
        };
      });
    },
    async mutateStorage(
      payload: MutateStoragePayload,
      author?: AuthorMarker,
    ): Promise<ResultOrError<void>> {
      return wrapAsyncCallback(async () => {
        state.mutateStorage(payload, author);
      });
    },
    async setNavigationState(navState: NavigationState<Href>): Promise<ResultOrError<void>> {
      return wrapAsyncCallback(async () => {
        state.setNavigationState(navState);
      });
    },
    async dispose(): Promise<ResultOrError<void>> {
      return { value: undefined };
    },
    //
    blobDriver: undefined as any,
    //
    logDriver: undefined as any,
    //
    lsDriver: undefined as any,
    //
    pFrameDriver: undefined as any,
  } as PlatformaExtended<PlatformaV3<D, A, O, Href, Plugins>>;
}

// =============================================================================
// Helpers
// =============================================================================

const defaultData = (): Data => ({ count: 0, label: "" });

const defaultOutputs = (): Outputs => ({
  doubled: { ok: true, value: 0, stable: true },
});

const defaultPluginData = (): PluginData => ({ value: 10 });

const defaultBlockModelInfo = (pluginIds: PluginHandle[] = []): BlockModelInfo => ({
  outputs: {
    doubled: { withStatus: false },
  },
  pluginIds,
  featureFlags: {},
});

function createDefaultState(plugins?: Record<string, unknown>) {
  return new BlockStateV3Mock<Data, Outputs>(defaultData(), defaultOutputs(), "/", plugins);
}

// =============================================================================
// Tests
// =============================================================================

describe("createAppV3", { timeout: 20_000 }, () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
    });
  });

  it("should create an app with reactive data", async () => {
    const state = createDefaultState();
    const platforma = createMockApiV3<Data, Args, Outputs>(state, defaultBlockModelInfo());
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    expect(app.model.data).toEqual({ count: 0, label: "" });
    expect(app.model.outputs.doubled).toEqual(0);

    app.closedRef = true;
  });

  it("should persist data mutations via mutateStorage", async () => {
    const state = createDefaultState();
    const platforma = createMockApiV3<Data, Args, Outputs>(state, defaultBlockModelInfo());
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    app.model.data.count = 5;
    app.model.data.label = "hello";

    await app.allSettled();
    await delay(patchPoolingDelay + 50);

    // Block storage should reflect the mutation
    expect(state.blockStorage.__data).toEqual({ count: 5, label: "hello" });

    app.closedRef = true;
  });

  it("should update outputs from external changes", async () => {
    const state = createDefaultState();
    const platforma = createMockApiV3<Data, Args, Outputs>(state, defaultBlockModelInfo());
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    expect(app.model.outputs.doubled).toEqual(0);

    // Simulate external output change (e.g. from workflow)
    state.setOutputs({ doubled: { ok: true, value: 42, stable: true } });

    await delay(patchPoolingDelay + 50);

    expect(app.model.outputs.doubled).toEqual(42);

    app.closedRef = true;
  });

  it("should filter plugin outputs from block-level outputs", async () => {
    const pluginId = "counter" as PluginHandle;
    const pluginOutputName = pluginOutputKey(pluginId, "formatted");

    const outputsWithPlugin = {
      ...defaultOutputs(),
      [pluginOutputName]: { ok: true, value: "count: 10", stable: true },
    } as Outputs;

    const state = new BlockStateV3Mock<Data, Outputs>(defaultData(), outputsWithPlugin, "/", {
      [pluginId]: defaultPluginData(),
    });

    const blockModelInfo: BlockModelInfo = {
      outputs: {
        doubled: { withStatus: false },
        [pluginOutputName]: { withStatus: false },
      },
      pluginIds: [pluginId],
    };

    const platforma = createMockApiV3<Data, Args, Outputs>(state, blockModelInfo);
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    // Block-level outputs should NOT contain plugin outputs
    expect(app.model.outputs.doubled).toEqual(0);
    expect(app.model.outputs).not.toHaveProperty(pluginOutputName);

    app.closedRef = true;
  });

  it("should provide plugin data and outputs via pluginAccess", async () => {
    type F = PluginFactory<PluginData, undefined, { formatted: string }>;
    const pluginId = "counter" as PluginHandle<F>;
    const pluginOutputName = pluginOutputKey(pluginId, "formatted");

    const outputsWithPlugin = {
      ...defaultOutputs(),
      [pluginOutputName]: { ok: true, value: "count: 10", stable: true },
    } as Outputs;

    const state = new BlockStateV3Mock<Data, Outputs>(defaultData(), outputsWithPlugin, "/", {
      [pluginId]: defaultPluginData(),
    });

    const blockModelInfo: BlockModelInfo = {
      outputs: {
        doubled: { withStatus: false },
        [pluginOutputName]: { withStatus: false },
      },
      pluginIds: [pluginId],
    };

    const platforma = createMockApiV3<Data, Args, Outputs>(state, blockModelInfo);
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app, pluginAccess } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    const pluginState = pluginAccess.getOrCreatePluginState(pluginId);

    // Plugin data should be loaded
    expect(pluginState.model.data).toEqual({ value: 10 });

    // Plugin output should be extracted (without the prefix)
    expect(pluginState.model.outputs["formatted"]).toEqual("count: 10");

    app.closedRef = true;
  });

  it("should persist plugin data mutations", async () => {
    type F = PluginFactory<PluginData, undefined, { formatted: string }>;
    const pluginId = "counter" as PluginHandle<F>;

    const state = createDefaultState({ [pluginId]: defaultPluginData() });

    const platforma = createMockApiV3<Data, Args, Outputs>(
      state,
      defaultBlockModelInfo([pluginId]),
    );
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app, pluginAccess } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    const pluginState = pluginAccess.getOrCreatePluginState(pluginId);
    expect(pluginState.model.data).toEqual({ value: 10 });

    // Mutate plugin data
    (pluginState.model.data as PluginData).value = 42;

    await app.allSettled();
    await delay(patchPoolingDelay + 50);

    // Storage should reflect the plugin data mutation
    expect(state.blockStorage.__plugins?.[pluginId]?.__data).toEqual({ value: 42 });

    app.closedRef = true;
  });

  it("should reconcile plugin data from external changes", async () => {
    type F = PluginFactory<PluginData, undefined, { formatted: string }>;
    const pluginId = "counter" as PluginHandle<F>;

    const state = createDefaultState({ [pluginId]: defaultPluginData() });

    const platforma = createMockApiV3<Data, Args, Outputs>(
      state,
      defaultBlockModelInfo([pluginId]),
    );
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app, pluginAccess } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    const pluginState = pluginAccess.getOrCreatePluginState(pluginId);
    expect(pluginState.model.data).toEqual({ value: 10 });

    // Simulate external mutation (different author)
    state.mutateStorage(
      { operation: "update-plugin-data", pluginId, value: { value: 99 } },
      { authorId: "external", localVersion: 1 },
    );

    await delay(patchPoolingDelay + 50);

    // Plugin data should reconcile from external change
    expect(pluginState.model.data).toEqual({ value: 99 });

    app.closedRef = true;
  });

  it("should reconcile block data from external changes", async () => {
    const state = createDefaultState();
    const platforma = createMockApiV3<Data, Args, Outputs>(state, defaultBlockModelInfo());
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    expect(app.model.data).toEqual({ count: 0, label: "" });

    // Simulate external mutation (different author)
    state.mutateStorage(
      { operation: "update-block-data", value: { count: 77, label: "external" } },
      { authorId: "external", localVersion: 1 },
    );

    await delay(patchPoolingDelay + 50);

    expect(app.model.data).toEqual({ count: 77, label: "external" });

    app.closedRef = true;
  });

  it("should report output errors", async () => {
    const state = new BlockStateV3Mock<Data, Outputs>(
      defaultData(),
      {
        doubled: {
          ok: false,
          errors: [{ message: "computation failed" }],
        },
      } as unknown as Outputs,
      "/",
    );

    const platforma = createMockApiV3<Data, Args, Outputs>(state, defaultBlockModelInfo());
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    expect(app.model.outputs.doubled).toBeUndefined();
    expect(app.model.outputErrors.doubled).toBeDefined();

    app.closedRef = true;
  });

  it("should report plugin output errors", async () => {
    type F = PluginFactory<PluginData, undefined, { formatted: string }>;
    const pluginId = "counter" as PluginHandle<F>;
    const pluginOutputName = pluginOutputKey(pluginId, "formatted");

    const outputsWithError = {
      ...defaultOutputs(),
      [pluginOutputName]: {
        ok: false,
        errors: [{ message: "plugin error" }],
      },
    } as Outputs;

    const state = new BlockStateV3Mock<Data, Outputs>(defaultData(), outputsWithError, "/", {
      [pluginId]: defaultPluginData(),
    });

    const blockModelInfo: BlockModelInfo = {
      outputs: {
        doubled: { withStatus: false },
        [pluginOutputName]: { withStatus: false },
      },
      pluginIds: [pluginId],
    };

    const platforma = createMockApiV3<Data, Args, Outputs>(state, blockModelInfo);
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app, pluginAccess } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    const pluginState = pluginAccess.getOrCreatePluginState(pluginId);

    // Plugin output should be undefined on error
    expect(pluginState.model.outputs["formatted"]).toBeUndefined();
    // Plugin output error should be set
    expect(pluginState.model.outputErrors["formatted"]).toBeDefined();

    app.closedRef = true;
  });

  it("should navigate to href", async () => {
    const state = createDefaultState();
    const platforma = createMockApiV3<Data, Args, Outputs>(state, defaultBlockModelInfo());
    const initialState = await platforma.loadBlockState();
    if ("error" in initialState) throw initialState.error;

    const { app } = createAppV3<Data, Args, Outputs>(initialState.value!, platforma, {
      debug: false,
      debounceSpan: 10,
    });

    expect(app.href).toBe("/");

    await app.navigateTo("/settings" as `/${string}`);
    await delay(patchPoolingDelay + 50);

    expect(state.href).toBe("/settings");

    app.closedRef = true;
  });
});
