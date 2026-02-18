import type {
  BlockRenderingMode,
  BlockSection,
  OutputWithStatus,
  PlRef,
  BlockCodeKnownFeatureFlags,
  BlockConfigContainer,
} from "@milaboratories/pl-model-common";
import { getPlatformaInstance, isInUI, createAndRegisterRenderLambda } from "./internal";
import type { DataModel } from "./block_migrations";
import type { PlatformaV3 } from "./platforma";
import type { InferRenderFunctionReturn, RenderFunction } from "./render";
import { RenderCtx } from "./render";
import type { PluginModel } from "./plugin_model";
import type { RenderCtxBase } from "./render";
import { PlatformaSDKVersion } from "./version";
// Import storage VM integration (side-effect: registers internal callbacks)
import { BlockPrivateCallbacks, registerPrivateCallbacks } from "./block_storage_vm";
import { type PluginName } from "./block_storage";
import type {
  ConfigRenderLambda,
  DeriveHref,
  ConfigRenderLambdaFlags,
  InferOutputsFromLambdas,
} from "./bconfig";
import { downgradeCfgOrLambda, isConfigLambda } from "./bconfig";
import type { PlatformaExtended } from "./platforma";
import { BLOCK_STORAGE_FACADE_VERSION, BlockStorageFacadeHandles } from "./block_storage_facade";

type SectionsExpectedType = readonly BlockSection[];

type NoOb = Record<string, never>;

/**
 * Per-property lambdas for deriving plugin params from block render context.
 * Each property is a function that receives the block's RenderCtxBase and returns the param value.
 */
export type ParamsInput<Params, BArgs = unknown, BData = unknown> = {
  [K in keyof Params]: (ctx: RenderCtxBase<BArgs, BData>) => Params[K];
};

/**
 * Type-erased version of ParamsInput for internal storage.
 * Args and Data are checked at registration time; only Params is preserved.
 */
type ParamsInputErased<Params> = {
  [K in keyof Params]: (ctx: RenderCtxBase) => Params[K];
};

/**
 * Internal type for tracking registered plugins.
 * Used to accumulate plugin types in BlockModelV3 builder chain.
 */
export type PluginInstance<Data = unknown, Params = unknown, Outputs = unknown> = {
  // Type markers (used only for type inference, set to undefined at runtime)
  readonly __pluginData?: Data;
  readonly __pluginParams?: Params;
  readonly __pluginOutputs?: Outputs;
  // Runtime values
  readonly __pluginModel: PluginModel<Data, Params, Outputs>;
  readonly __paramsInput?: ParamsInputErased<Params>;
};

interface BlockModelV3Config<
  Args,
  OutputsCfg extends Record<string, ConfigRenderLambda>,
  Data,
  Plugins extends Record<string, PluginInstance> = {},
> {
  renderingMode: BlockRenderingMode;
  dataModel: DataModel<Data>;
  outputs: OutputsCfg;
  sections: ConfigRenderLambda;
  title: ConfigRenderLambda | undefined;
  subtitle: ConfigRenderLambda | undefined;
  tags: ConfigRenderLambda | undefined;
  enrichmentTargets: ConfigRenderLambda | undefined;
  featureFlags: BlockCodeKnownFeatureFlags;
  args: ConfigRenderLambda<Args> | undefined;
  prerunArgs: ConfigRenderLambda<unknown> | undefined;
  plugins: Plugins;
}

/** Options for creating a BlockModelV3 */
export interface BlockModelV3Options<Data extends Record<string, unknown>> {
  /** The data model that defines initial data and migrations */
  dataModel: DataModel<Data>;
  /** Rendering mode for the block (default: 'Heavy') */
  renderingMode?: BlockRenderingMode;
}

/** Main entry point that each block should use in it's "config" module. Don't forget
 * to call {@link done()} at the end of configuration. Value returned by this builder must be
 * exported as constant with name "platforma" from the "config" module.
 * API version is 3 (for UI) and 2 (for model) */
export class BlockModelV3<
  Args,
  OutputsCfg extends Record<string, ConfigRenderLambda>,
  Data extends Record<string, unknown> = Record<string, unknown>,
  Href extends `/${string}` = "/",
  Plugins extends Record<string, PluginInstance> = {},
> {
  private constructor(
    private readonly config: BlockModelV3Config<Args, OutputsCfg, Data, Plugins>,
  ) {}

  public static readonly INITIAL_BLOCK_FEATURE_FLAGS: BlockCodeKnownFeatureFlags = {
    supportsLazyState: true,
    requiresUIAPIVersion: 3,
    requiresModelAPIVersion: BLOCK_STORAGE_FACADE_VERSION,
    requiresCreatePTableV2: true,
  };

  /**
   * Creates a new BlockModelV3 builder with the specified data model and options.
   *
   * @example
   * const dataModel = new DataModelBuilder()
   *   .from<BlockData>(DATA_MODEL_DEFAULT_VERSION)
   *   .init(() => ({ numbers: [], labels: [] }));
   *
   * BlockModelV3.create({ dataModel })
   *   .args((data) => ({ numbers: data.numbers }))
   *   .sections(() => [{ type: 'link', href: '/', label: 'Main' }])
   *   .done();
   *
   * @param options Configuration options including required data model
   */
  public static create<Data extends Record<string, unknown>>(
    options: BlockModelV3Options<Data>,
  ): BlockModelV3<NoOb, {}, Data> {
    const { dataModel, renderingMode = "Heavy" } = options;

    return new BlockModelV3<NoOb, {}, Data>({
      renderingMode,
      dataModel,
      outputs: {},
      // Register default sections callback (returns empty array)
      sections: createAndRegisterRenderLambda({ handle: "sections", lambda: () => [] }, true),
      title: undefined,
      subtitle: undefined,
      tags: undefined,
      enrichmentTargets: undefined,
      featureFlags: { ...BlockModelV3.INITIAL_BLOCK_FEATURE_FLAGS },
      args: undefined,
      prerunArgs: undefined,
      plugins: {},
    });
  }

  /**
   * Add output cell wrapped with additional status information to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param rf  callback calculating output value using context, that allows to access
   *            workflows outputs and interact with platforma drivers
   * @param flags additional flags that may alter lambda rendering procedure
   * */
  public output<const Key extends string, const RF extends RenderFunction<Args, Data, unknown>>(
    key: Key,
    rf: RF,
    flags: ConfigRenderLambdaFlags & { withStatus: true },
  ): BlockModelV3<
    Args,
    OutputsCfg & {
      [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>> & {
        withStatus: true;
      };
    },
    Data,
    Href,
    Plugins
  >;
  /**
   * Add output cell to the configuration
   *
   * @param key output cell name, that can be later used to retrieve the rendered value
   * @param rf  callback calculating output value using context, that allows to access
   *            workflows outputs and interact with platforma drivers
   * @param flags additional flags that may alter lambda rendering procedure
   * */
  public output<const Key extends string, const RF extends RenderFunction<Args, Data, unknown>>(
    key: Key,
    rf: RF,
    flags?: ConfigRenderLambdaFlags,
  ): BlockModelV3<
    Args,
    OutputsCfg & {
      [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>>;
    },
    Data,
    Href,
    Plugins
  >;
  public output(
    key: string,
    cfgOrRf: RenderFunction<Args, Data, unknown>,
    flags: ConfigRenderLambdaFlags = {},
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins> {
    return new BlockModelV3({
      ...this.config,
      outputs: {
        ...this.config.outputs,
        [key]: createAndRegisterRenderLambda({
          handle: `output#${key}`,
          lambda: () => cfgOrRf(new RenderCtx<Args, Data>()),
          ...flags,
        }),
      },
    });
  }

  /** Shortcut for {@link output} with retentive flag set to true. */
  public retentiveOutput<
    const Key extends string,
    const RF extends RenderFunction<Args, Data, unknown>,
  >(
    key: Key,
    rf: RF,
  ): BlockModelV3<
    Args,
    OutputsCfg & {
      [K in Key]: ConfigRenderLambda<InferRenderFunctionReturn<RF>>;
    },
    Data,
    Href,
    Plugins
  > {
    return this.output(key, rf, { retentive: true });
  }

  /** Shortcut for {@link output} with withStatus flag set to true. */
  public outputWithStatus<
    const Key extends string,
    const RF extends RenderFunction<Args, Data, unknown>,
  >(key: Key, rf: RF) {
    return this.output(key, rf, { withStatus: true });
  }

  /**
   * Sets a function to derive block args from data.
   * This is called during setData to compute the args that will be used for block execution.
   *
   * @example
   * .args<BlockArgs>((data) => ({ numbers: data.numbers }))
   *
   * @example
   * .args<BlockArgs>((data) => {
   *   if (data.numbers.length === 0) throw new Error('Numbers required'); // block not ready
   *   return { numbers: data.numbers };
   * })
   */
  public args<Args>(
    lambda: (data: Data) => Args,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins>({
      ...this.config,
      args: createAndRegisterRenderLambda<Args>({ handle: "args", lambda }),
    });
  }

  /**
   * Sets a function to derive pre-run args from data (optional).
   * This is called during setData to compute the args that will be used for staging/pre-run phase.
   *
   * If not defined, defaults to using the args() function result.
   * If defined, uses its return value for the staging / prerun phase.
   *
   * The staging / prerun phase runs only if currentPrerunArgs differs from the executed
   * version of prerunArgs (same comparison logic as currentArgs vs prodArgs).
   *
   * @example
   * .prerunArgs((data) => ({ numbers: data.numbers }))
   *
   * @example
   * .prerunArgs((data) => {
   *   // Return undefined to skip staging for this block
   *   if (!data.isReady) return undefined;
   *   return { numbers: data.numbers };
   * })
   */
  public prerunArgs(
    fn: (data: Data) => unknown,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins>({
      ...this.config,
      prerunArgs: createAndRegisterRenderLambda({
        handle: "prerunArgs",
        lambda: fn,
      }),
    });
  }

  /** Sets the lambda to generate list of sections in the left block overviews panel. */
  public sections<
    const Ret extends SectionsExpectedType,
    const RF extends RenderFunction<Args, Data, Ret>,
  >(rf: RF): BlockModelV3<Args, OutputsCfg, Data, DeriveHref<ReturnType<RF>>, Plugins> {
    return new BlockModelV3<Args, OutputsCfg, Data, DeriveHref<ReturnType<RF>>, Plugins>({
      ...this.config,
      // Replace the default sections callback with the user-provided one
      sections: createAndRegisterRenderLambda(
        { handle: "sections", lambda: () => rf(new RenderCtx<Args, Data>()) },
        true,
      ),
    });
  }

  /** Sets a rendering function to derive block title, shown for the block in the left blocks-overview panel. */
  public title(
    rf: RenderFunction<Args, Data, string>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins>({
      ...this.config,
      title: createAndRegisterRenderLambda({
        handle: "title",
        lambda: () => rf(new RenderCtx<Args, Data>()),
      }),
    });
  }

  public subtitle(
    rf: RenderFunction<Args, Data, string>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins>({
      ...this.config,
      subtitle: createAndRegisterRenderLambda({
        handle: "subtitle",
        lambda: () => rf(new RenderCtx<Args, Data>()),
      }),
    });
  }

  public tags(
    rf: RenderFunction<Args, Data, string[]>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins>({
      ...this.config,
      tags: createAndRegisterRenderLambda({
        handle: "tags",
        lambda: () => rf(new RenderCtx<Args, Data>()),
      }),
    });
  }

  /** Sets or overrides feature flags for the block. */
  public withFeatureFlags(
    flags: Partial<BlockCodeKnownFeatureFlags>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins>({
      ...this.config,
      featureFlags: { ...this.config.featureFlags, ...flags },
    });
  }

  /**
   * Defines how to derive list of upstream references this block is meant to enrich with its exports from block args.
   * Influences dependency graph construction.
   */
  public enriches(
    lambda: (args: Args) => PlRef[],
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins>({
      ...this.config,
      enrichmentTargets: createAndRegisterRenderLambda({
        handle: "enrichmentTargets",
        lambda: lambda,
      }),
    });
  }

  /**
   * Registers a plugin instance with the block.
   *
   * Plugins are UI components with their own model logic and persistent state.
   * Each plugin must have a unique pluginId within the block.
   *
   * @param pluginId - Unique identifier for this plugin instance within the block
   * @param plugin - Configured PluginModel instance (created via factory.create(config))
   * @param params - Per-property lambdas deriving plugin params from block RenderCtx
   *
   * @example
   * .plugin('mainTable', dataTablePlugin.create({ defaultOps: {...} }), {
   *   columns: (ctx) => ctx.outputs?.resolve("data")?.getPColumns(),
   *   sourceId: (ctx) => ctx.data.selectedSource,
   * })
   */
  public plugin<const PluginId extends string, PluginData, PluginParams, PluginOutputs>(
    pluginId: PluginId,
    plugin: PluginModel<PluginData, PluginParams, PluginOutputs>,
    params?: ParamsInput<PluginParams, Args, Data>,
  ): BlockModelV3<
    Args,
    OutputsCfg,
    Data,
    Href,
    Plugins & { [K in PluginId]: PluginInstance<PluginData, PluginParams, PluginOutputs> }
  > {
    // Validate pluginId uniqueness
    if (pluginId in this.config.plugins) {
      throw new Error(`Plugin '${pluginId}' already registered`);
    }

    // Create plugin instance metadata
    const instance: PluginInstance<PluginData, PluginParams, PluginOutputs> = {
      __pluginData: undefined,
      __pluginParams: undefined,
      __pluginOutputs: undefined,
      __pluginModel: plugin,
      // Type-erase the params input - safe because we only call it with the correct context types
      __paramsInput: params as ParamsInputErased<PluginParams> | undefined,
    };

    return new BlockModelV3({
      ...this.config,
      plugins: {
        ...this.config.plugins,
        [pluginId]: instance,
      },
    });
  }

  /** Renders all provided block settings into a pre-configured platforma API
   * instance, that can be used in frontend to interact with block data, and
   * other features provided by the platforma to the block. */
  public done(): PlatformaExtended<
    PlatformaV3<Args, InferOutputsFromLambdas<OutputsCfg>, Data, Href, Plugins>
  > {
    return this.withFeatureFlags({
      ...this.config.featureFlags,
    })._done();
  }

  public _done(): PlatformaExtended<
    PlatformaV3<Args, InferOutputsFromLambdas<OutputsCfg>, Data, Href, Plugins>
  > {
    if (this.config.args === undefined) throw new Error("Args rendering function not set.");

    const apiVersion = 3;

    // Build plugin registry and register plugin callbacks for migration
    const pluginRegistry: Record<string, PluginName> = {};
    const pluginModels: Record<string, PluginModel> = {};

    for (const [pluginId, instance] of Object.entries(this.config.plugins)) {
      pluginRegistry[pluginId] = instance.__pluginModel.name as PluginName;
      pluginModels[pluginId] = instance.__pluginModel;
    }

    const { dataModel } = this.config;
    registerPrivateCallbacks({
      [BlockPrivateCallbacks.BlockDataMigrate]: (v) => dataModel.migrate(v),
      [BlockPrivateCallbacks.BlockDataInit]: () => dataModel.getDefaultData(),
      [BlockPrivateCallbacks.PluginRegistry]: () => pluginRegistry,
      [BlockPrivateCallbacks.PluginDataMigrate]: (pluginId, v) => {
        const model = pluginModels[pluginId];
        if (!model) throw new Error(`Plugin model not found for '${pluginId}'`);
        return model.dataModel.migrate(v);
      },
      [BlockPrivateCallbacks.PluginDataInit]: (pluginId) => {
        const model = pluginModels[pluginId];
        if (!model) throw new Error(`Plugin model not found for '${pluginId}'`);
        return model.dataModel.getDefaultData();
      },
    });

    const blockConfig: BlockConfigContainer = {
      v4: {
        configVersion: 4,
        modelAPIVersion: 2,
        sdkVersion: PlatformaSDKVersion,
        renderingMode: this.config.renderingMode,
        args: this.config.args,
        prerunArgs: this.config.prerunArgs,
        sections: this.config.sections,
        title: this.config.title,
        subtitle: this.config.subtitle,
        tags: this.config.tags,
        outputs: this.config.outputs,
        enrichmentTargets: this.config.enrichmentTargets,
        featureFlags: this.config.featureFlags,
        facadeCallbacks: { ...BlockStorageFacadeHandles },
      },

      // fields below are added to allow previous desktop versions read generated configs
      sdkVersion: PlatformaSDKVersion,
      renderingMode: this.config.renderingMode,
      sections: this.config.sections,
      outputs: Object.fromEntries(
        Object.entries(this.config.outputs).map(([key, value]) => [
          key,
          downgradeCfgOrLambda(value),
        ]),
      ),
    };

    globalThis.platformaApiVersion = apiVersion;

    if (!isInUI())
      // we are in the configuration rendering routine, not in actual UI
      return { config: blockConfig } as any;
    // normal operation inside the UI
    else
      return {
        ...getPlatformaInstance({
          sdkVersion: PlatformaSDKVersion,
          apiVersion,
        }),
        blockModelInfo: {
          outputs: Object.fromEntries(
            Object.entries(this.config.outputs).map(([key, value]) => [
              key,
              {
                withStatus: Boolean(isConfigLambda(value) && value.withStatus),
              },
            ]),
          ),
        },
      } as any;
  }
}

// Type tests for BlockModelV3

export type Expect<T extends true> = T;

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

export type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B ? B[K] : K extends keyof A ? A[K] : never;
};

// Helper types for testing
type _TestArgs = { inputFile: string; threshold: number };
type _TestData = { selectedTab: string };
type _TestOutputs = {
  result: ConfigRenderLambda<string>;
  count: ConfigRenderLambda<number>;
};

// Test: Merge type works correctly
type _MergeTest1 = Expect<Equal<Merge<{ a: 1 }, { b: 2 }>, { a: 1; b: 2 }>>;
type _MergeTest2 = Expect<Equal<Merge<{ a: 1 }, { a: 2 }>, { a: 2 }>>;
type _MergeTest3 = Expect<Equal<Merge<{ a: 1; b: 1 }, { b: 2; c: 3 }>, { a: 1; b: 2; c: 3 }>>;

// Test: create() returns a BlockModelV3 instance
// Note: Due to function overloads, ReturnType uses the last overload signature.
// We verify the structure is correct using a simpler assignability test.
type _CreateResult = ReturnType<typeof BlockModelV3.create>;
type _CreateIsBlockModelV3 =
  _CreateResult extends BlockModelV3<infer _A, infer _O, infer _S> ? true : false;
type _CreateTest = Expect<_CreateIsBlockModelV3>;

// Test: BlockModelV3Config interface structure
type _ConfigTest = Expect<
  Equal<
    BlockModelV3Config<_TestArgs, _TestOutputs, _TestData>,
    {
      renderingMode: BlockRenderingMode;
      args: ConfigRenderLambda<_TestArgs> | undefined;
      prerunArgs: ConfigRenderLambda<unknown> | undefined;
      dataModel: DataModel<_TestData>;
      outputs: _TestOutputs;
      sections: ConfigRenderLambda;
      title: ConfigRenderLambda | undefined;
      subtitle: ConfigRenderLambda | undefined;
      tags: ConfigRenderLambda | undefined;
      enrichmentTargets: ConfigRenderLambda | undefined;
      featureFlags: BlockCodeKnownFeatureFlags;
      plugins: {};
    }
  >
>;

// Test: Default Href is '/'
type _HrefDefaultTest =
  BlockModelV3<_TestArgs, {}, _TestData> extends BlockModelV3<_TestArgs, {}, _TestData, "/">
    ? true
    : false;
type _VerifyHrefDefault = Expect<_HrefDefaultTest>;

// Test: Custom Href can be specified
type _CustomHref = "/settings" | "/main";
type _HrefCustomBuilder = BlockModelV3<_TestArgs, {}, _TestData, _CustomHref>;
type _HrefCustomTest =
  _HrefCustomBuilder extends BlockModelV3<_TestArgs, {}, _TestData, _CustomHref> ? true : false;
type _VerifyHrefCustom = Expect<_HrefCustomTest>;

// Test: Output type accumulation with & intersection
type _OutputsAccumulation = { a: ConfigRenderLambda<string> } & {
  b: ConfigRenderLambda<number>;
};
type _VerifyOutputsHaveKeys = Expect<Equal<keyof _OutputsAccumulation, "a" | "b">>;

// Test: Builder with all type parameters specified compiles
type _FullBuilder = BlockModelV3<_TestArgs, _TestOutputs, _TestData, "/main">;
type _FullBuilderTest =
  _FullBuilder extends BlockModelV3<_TestArgs, _TestOutputs, _TestData, "/main"> ? true : false;
type _VerifyFullBuilder = Expect<_FullBuilderTest>;

// Test: InferOutputsFromLambdas maps outputs correctly
type _InferOutputsTest = InferOutputsFromLambdas<{
  myOutput: ConfigRenderLambda<number>;
}>;
type _VerifyInferOutputs = Expect<
  Equal<_InferOutputsTest, { myOutput: OutputWithStatus<number> & { __unwrap: true } }>
>;
