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
import { BlockRenderCtx, PluginRenderCtx } from "./render";
import type { PluginData, PluginModel, PluginOutputs, PluginParams } from "./plugin_model";
import { PluginInstance as PluginInstanceClass, CREATE_PLUGIN_MODEL } from "./plugin_model";
import { type PluginHandle, pluginOutputKey } from "./plugin_handle";
import type { RenderCtxBase } from "./render";
import { PlatformaSDKVersion } from "./version";
import {
  applyStorageUpdate,
  getStorageDebugView,
  migrateStorage,
  createInitialStorage,
  deriveArgsFromStorage,
  derivePrerunArgsFromStorage,
} from "./block_storage_callbacks";
import { type PluginName } from "./block_storage";
import type {
  ConfigRenderLambda,
  DeriveHref,
  ConfigRenderLambdaFlags,
  InferOutputsFromLambdas,
} from "./bconfig";
import { downgradeCfgOrLambda, isConfigLambda } from "./bconfig";
import type { PlatformaExtended } from "./platforma";
import {
  BLOCK_STORAGE_FACADE_VERSION,
  BlockStorageFacadeCallbacks,
  BlockStorageFacadeHandles,
  registerFacadeCallbacks,
} from "./block_storage_facade";

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
 */
type ParamsInputErased = Record<string, (ctx: RenderCtxBase) => unknown>;

/**
 * Merges two feature flag objects with type-aware logic:
 * - `supports*` (boolean): OR — `true` if either side is `true`
 * - `requires*` (numeric): MAX — take the higher version requirement
 */
function mergeFeatureFlags(
  base: BlockCodeKnownFeatureFlags,
  override: BlockCodeKnownFeatureFlags,
): BlockCodeKnownFeatureFlags {
  const result: Record<string, boolean | number | undefined> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const existing = result[key];
    if (typeof value === "boolean") {
      result[key] = (typeof existing === "boolean" && existing) || value;
    } else if (typeof value === "number") {
      result[key] = Math.max(typeof existing === "number" ? existing : 0, value);
    }
  }
  return result as BlockCodeKnownFeatureFlags;
}

/**
 * Plugin record: model + param derivation lambdas.
 * Type parameters are carried by PluginModel generic.
 */
export type PluginRecord<
  Data extends PluginData = PluginData,
  Params extends PluginParams = undefined,
  Outputs extends PluginOutputs = PluginOutputs,
> = {
  readonly model: PluginModel<Data, Params, Outputs>;
  readonly inputs: ParamsInputErased;
};

interface BlockModelV3Config<
  OutputsCfg extends Record<string, ConfigRenderLambda>,
  Data,
  Plugins extends Record<string, PluginRecord> = {},
  Transfers extends Record<string, unknown> = {},
> {
  renderingMode: BlockRenderingMode;
  dataModel: DataModel<Data, Transfers>;
  outputs: OutputsCfg;
  sections: ConfigRenderLambda;
  title: ConfigRenderLambda | undefined;
  subtitle: ConfigRenderLambda | undefined;
  tags: ConfigRenderLambda | undefined;
  enrichmentTargets: ConfigRenderLambda | undefined;
  featureFlags: BlockCodeKnownFeatureFlags;
  argsFunction: ((data: unknown) => unknown) | undefined;
  prerunArgsFunction: ((data: unknown) => unknown) | undefined;
  plugins: Plugins;
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
  Plugins extends Record<string, PluginRecord> = {},
  Transfers extends Record<string, unknown> = {},
> {
  private constructor(
    private readonly config: BlockModelV3Config<OutputsCfg, Data, Plugins, Transfers>,
  ) {}

  public static readonly INITIAL_BLOCK_FEATURE_FLAGS: BlockCodeKnownFeatureFlags = {
    supportsLazyState: true,
    supportsPframeQueryRanking: true,
    requiresUIAPIVersion: 3,
    requiresModelAPIVersion: BLOCK_STORAGE_FACADE_VERSION,
    requiresCreatePTable: 2,
  };

  /**
   * Creates a new BlockModelV3 builder with the specified data model.
   *
   * @example
   * const dataModel = new DataModelBuilder()
   *   .from<BlockData>("v1")
   *   .init(() => ({ numbers: [], labels: [] }));
   *
   * BlockModelV3.create(dataModel)
   *   .args((data) => ({ numbers: data.numbers }))
   *   .sections(() => [{ type: 'link', href: '/', label: 'Main' }])
   *   .done();
   *
   * @param dataModel The data model that defines initial data and migrations
   */
  public static create<
    Data extends Record<string, unknown>,
    Transfers extends Record<string, unknown> = {},
  >(dataModel: DataModel<Data, Transfers>): BlockModelV3<NoOb, {}, Data, "/", {}, Transfers> {
    return new BlockModelV3<NoOb, {}, Data, "/", {}, Transfers>({
      renderingMode: "Heavy",
      dataModel,
      outputs: {},
      sections: createAndRegisterRenderLambda({ handle: "sections", lambda: () => [] }, true),
      title: undefined,
      subtitle: undefined,
      tags: undefined,
      enrichmentTargets: undefined,
      featureFlags: { ...BlockModelV3.INITIAL_BLOCK_FEATURE_FLAGS },
      argsFunction: undefined,
      prerunArgsFunction: undefined,
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
    Plugins,
    Transfers
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
    Plugins,
    Transfers
  >;
  public output(
    key: string,
    cfgOrRf: RenderFunction<Args, Data, unknown>,
    flags: ConfigRenderLambdaFlags = {},
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers> {
    return new BlockModelV3({
      ...this.config,
      outputs: {
        ...this.config.outputs,
        [key]: createAndRegisterRenderLambda({
          handle: `block-output#${key}`,
          lambda: () => cfgOrRf(new BlockRenderCtx<Args, Data>()),
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
    Plugins,
    Transfers
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
  public args<A>(
    lambda: (data: Data) => A,
  ): BlockModelV3<A, OutputsCfg, Data, Href, Plugins, Transfers> {
    return new BlockModelV3<A, OutputsCfg, Data, Href, Plugins, Transfers>({
      ...this.config,
      argsFunction: lambda as (data: unknown) => unknown,
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
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers>({
      ...this.config,
      prerunArgsFunction: fn as (data: unknown) => unknown,
    });
  }

  /** Sets the lambda to generate list of sections in the left block overviews panel. */
  public sections<
    const Ret extends SectionsExpectedType,
    const RF extends RenderFunction<Args, Data, Ret>,
  >(rf: RF): BlockModelV3<Args, OutputsCfg, Data, DeriveHref<ReturnType<RF>>, Plugins, Transfers> {
    return new BlockModelV3<Args, OutputsCfg, Data, DeriveHref<ReturnType<RF>>, Plugins, Transfers>(
      {
        ...this.config,
        // Replace the default sections callback with the user-provided one
        sections: createAndRegisterRenderLambda(
          { handle: "sections", lambda: () => rf(new BlockRenderCtx<Args, Data>()) },
          true,
        ),
      },
    );
  }

  /** Sets a rendering function to derive block title, shown for the block in the left blocks-overview panel. */
  public title(
    rf: RenderFunction<Args, Data, string>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers>({
      ...this.config,
      title: createAndRegisterRenderLambda({
        handle: "title",
        lambda: () => rf(new BlockRenderCtx<Args, Data>()),
      }),
    });
  }

  public subtitle(
    rf: RenderFunction<Args, Data, string>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers>({
      ...this.config,
      subtitle: createAndRegisterRenderLambda({
        handle: "subtitle",
        lambda: () => rf(new BlockRenderCtx<Args, Data>()),
      }),
    });
  }

  public tags(
    rf: RenderFunction<Args, Data, string[]>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers>({
      ...this.config,
      tags: createAndRegisterRenderLambda({
        handle: "tags",
        lambda: () => rf(new BlockRenderCtx<Args, Data>()),
      }),
    });
  }

  /** Sets or overrides feature flags for the block. */
  public withFeatureFlags(
    flags: Partial<BlockCodeKnownFeatureFlags>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers>({
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
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers>({
      ...this.config,
      enrichmentTargets: createAndRegisterRenderLambda({
        handle: "enrichmentTargets",
        lambda: lambda,
      }),
    });
  }

  /**
   * Registers a plugin instance with the block.
   * Consumes a transfer if one was defined for this plugin ID in the migration chain.
   *
   * Type checks:
   * - If Transfers[Id] exists, verifies it extends PTransferData (transfer type compatibility)
   * - If no Transfers[Id], rejects plugins with transferAt set (missing .transfer() in data model)
   * - Rejects duplicate plugin IDs (Id already in keyof Plugins)
   *
   * @param instance - PluginInstance created via factory.create({ pluginId, ... })
   * @param params - Per-property lambdas deriving plugin params from block RenderCtx
   *
   * @example
   * .plugin(mainTable, {
   *   columns: (ctx) => ctx.outputs?.resolve("data")?.getPColumns(),
   *   sourceId: (ctx) => ctx.data.selectedSource,
   * })
   */
  public plugin<
    const PluginId extends string,
    PData extends PluginData,
    PParams extends PluginParams,
    POutputs extends PluginOutputs,
    PTransferData,
  >(
    instance: PluginInstanceClass<
      PluginId &
        (PluginId extends keyof Transfers
          ? Transfers[PluginId] extends PTransferData
            ? string
            : never
          : [PTransferData] extends [never]
            ? string
            : never) &
        (PluginId extends keyof Plugins ? never : string),
      PData,
      PParams,
      POutputs,
      PTransferData
    >,
    params?: ParamsInput<PParams, Args, Data>,
  ): BlockModelV3<
    Args,
    OutputsCfg,
    Data,
    Href,
    Plugins & { [K in PluginId]: PluginRecord<PData, PParams, POutputs> },
    Omit<Transfers, PluginId>
  >;
  public plugin(
    instance: PluginInstanceClass,
    params?: ParamsInput<Record<string, unknown>, unknown, unknown>,
  ): BlockModelV3<
    Args,
    OutputsCfg,
    Data,
    Href,
    Record<string, PluginRecord>,
    Record<string, unknown>
  > {
    const pluginId = instance.id;
    const plugin = instance[CREATE_PLUGIN_MODEL]();
    const resolvedParams = (params ?? {}) as ParamsInputErased;

    if (pluginId in this.config.plugins) {
      throw new Error(`Plugin '${pluginId}' already registered`);
    }

    const registered: PluginRecord = {
      model: plugin,
      inputs: resolvedParams,
    };

    return new BlockModelV3({
      ...this.config,
      plugins: {
        ...this.config.plugins,
        [pluginId]: registered,
      },
      featureFlags: mergeFeatureFlags(this.config.featureFlags, plugin.featureFlags ?? {}),
    });
  }

  /** Renders all provided block settings into a pre-configured platforma API
   * instance, that can be used in frontend to interact with block data, and
   * other features provided by the platforma to the block.
   *
   * Type-level check: if there are unconsumed transfers (from `.transfer()` calls
   * in the migration chain), this method requires an impossible `never` argument,
   * producing a compile error. Register all transferred plugins via `.plugin(instance)`
   * before calling `.done()`.
   */
  public done(
    ..._: keyof Transfers extends never ? [] : [never]
  ): PlatformaExtended<
    PlatformaV3<Data, Args, InferOutputsFromLambdas<OutputsCfg>, Href, Plugins>
  > {
    if (this.config.argsFunction === undefined) throw new Error("Args rendering function not set.");

    const apiVersion = 3;

    // Build plugin registry
    const { plugins } = this.config;
    const pluginRegistry: Record<string, PluginName> = {};
    const pluginHandles = Object.keys(plugins) as PluginHandle[];
    for (const handle of pluginHandles) {
      pluginRegistry[handle] = plugins[handle].model.name;
    }

    const { dataModel, argsFunction, prerunArgsFunction } = this.config;

    function getPlugin(handle: PluginHandle): PluginRecord {
      const plugin = plugins[handle];
      if (!plugin) throw new Error(`Plugin model not found for '${handle}'`);
      return plugin;
    }

    // Register ALL facade callbacks here, with dependencies captured via closures
    registerFacadeCallbacks({
      [BlockStorageFacadeCallbacks.StorageApplyUpdate]: applyStorageUpdate,
      [BlockStorageFacadeCallbacks.StorageDebugView]: getStorageDebugView,
      [BlockStorageFacadeCallbacks.StorageMigrate]: (currentStorageJson) =>
        migrateStorage(currentStorageJson, {
          migrateBlockData: (v) => dataModel.migrate(v),
          getPluginRegistry: () => pluginRegistry,
          migratePluginData: (handle, v) => getPlugin(handle).model.dataModel.migrate(v),
          createPluginData: (handle, transfer) => {
            if (transfer) return transfer;
            return getPlugin(handle).model.getDefaultData();
          },
        }),
      [BlockStorageFacadeCallbacks.StorageInitial]: () =>
        createInitialStorage({
          getDefaultBlockData: () => dataModel.getDefaultData(),
          getPluginRegistry: () => pluginRegistry,
          createPluginData: (handle) => getPlugin(handle).model.getDefaultData(),
        }),
      [BlockStorageFacadeCallbacks.ArgsDerive]: (storageJson) =>
        deriveArgsFromStorage(storageJson, argsFunction),
      [BlockStorageFacadeCallbacks.PrerunArgsDerive]: (storageJson) =>
        derivePrerunArgsFromStorage(storageJson, argsFunction, prerunArgsFunction),
    });

    // Register plugin input and output lambdas
    const pluginOutputs: Record<string, ConfigRenderLambda> = {};
    for (const handle of pluginHandles) {
      const { model, inputs } = plugins[handle];
      // Wrap plugin param lambdas: close over BlockRenderCtx creation
      const wrappedInputs: Record<string, () => unknown> = {};
      for (const [paramKey, paramFn] of Object.entries(inputs)) {
        wrappedInputs[paramKey] = () => paramFn(new BlockRenderCtx());
      }

      // Register plugin outputs (in config pack, evaluated by middle layer)
      const outputs = model.outputs as Record<string, (ctx: PluginRenderCtx) => unknown>;
      for (const [outputKey, outputFn] of Object.entries(outputs)) {
        const key = pluginOutputKey(handle, outputKey);
        pluginOutputs[key] = createAndRegisterRenderLambda({
          handle: key,
          lambda: () => outputFn(new PluginRenderCtx(handle, wrappedInputs)),
        });
      }
    }
    const allOutputs = { ...this.config.outputs, ...pluginOutputs };

    globalThis.platformaApiVersion = apiVersion;

    if (!isInUI()) {
      const blockConfig: BlockConfigContainer = {
        v4: {
          configVersion: 4,
          modelAPIVersion: BLOCK_STORAGE_FACADE_VERSION,
          sdkVersion: PlatformaSDKVersion,
          renderingMode: this.config.renderingMode,
          sections: this.config.sections,
          title: this.config.title,
          subtitle: this.config.subtitle,
          tags: this.config.tags,
          outputs: allOutputs,
          enrichmentTargets: this.config.enrichmentTargets,
          featureFlags: this.config.featureFlags,
          blockLifecycleCallbacks: { ...BlockStorageFacadeHandles },
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
      // we are in the configuration rendering routine, not in actual UI
      return { config: blockConfig } as any;
      // normal operation inside the UI
    } else {
      return {
        ...getPlatformaInstance({
          sdkVersion: PlatformaSDKVersion,
          apiVersion,
        }),
        blockModelInfo: {
          outputs: Object.fromEntries(
            Object.entries(allOutputs).map(([key, value]) => [
              key,
              {
                withStatus: Boolean(isConfigLambda(value) && value.withStatus),
              },
            ]),
          ),
          pluginIds: pluginHandles,
          featureFlags: this.config.featureFlags,
        },
      } as any;
    }
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

// Test: BlockModelV3Config interface structure (default generics)
type _ConfigTest = Expect<
  Equal<
    BlockModelV3Config<_TestOutputs, _TestData>,
    {
      renderingMode: BlockRenderingMode;
      argsFunction: ((data: unknown) => unknown) | undefined;
      prerunArgsFunction: ((data: unknown) => unknown) | undefined;
      dataModel: DataModel<_TestData, {}>;
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
