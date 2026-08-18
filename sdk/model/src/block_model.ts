import type {
  BlockRenderingMode,
  BlockSection,
  OutputWithStatus,
  PlRef,
  BlockCodeKnownFeatureFlags,
  BlockConfigContainer,
  BlockKindReference,
} from "@milaboratories/pl-model-common";
import { REQUIRES_PFRAMES_VERSION, formatKindRef } from "@milaboratories/pl-model-common";
import { getPlatformaInstance, isInUI, createAndRegisterRenderLambda } from "./internal";
import type { BlockKind, DataModel } from "./block_migrations";
import type { PlatformaV3 } from "./platforma";
import type { BlockDefaultUiServices } from "./services/service_resolve";
import { BLOCK_SERVICE_FLAGS } from "./services/block_services";
import type { InferRenderFunctionReturn, RenderFunction } from "./render";
import { BlockRenderCtx, PluginRenderCtx } from "./render";
import type {
  PluginData,
  PluginModel,
  PluginOutputs,
  PluginParams,
  PluginPublicOutputs,
} from "./plugin_model";
import { PluginInstance as PluginInstanceClass, CREATE_PLUGIN_MODEL } from "./plugin_model";
import { type PluginHandle, pluginOutputKey } from "./plugin_handle";
import type { RenderCtxBase } from "./render";
import { PlatformaSDKVersion } from "./version";
import {
  applyStorageUpdate,
  getStorageDebugView,
  migrateStorage,
  createInitialStorage,
  createInitialStorageFromParams,
  validateTemplateParamsJson,
  deriveArgsFromStorage,
  derivePrerunArgsFromStorage,
  deriveTemplateParamsFromStorage,
  relocateTemplateParams,
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
 */
export type PluginRecord<
  Data extends PluginData = PluginData,
  Params extends PluginParams = undefined,
  Outputs extends PluginOutputs = PluginOutputs,
  PublicOutputs extends PluginPublicOutputs = PluginPublicOutputs,
  ModelServices = unknown,
  UiServices = unknown,
> = {
  readonly model: PluginModel<Data, Params, Outputs, PublicOutputs, ModelServices, UiServices>;
  readonly inputs: ParamsInputErased;
};

interface BlockModelV3Config<
  OutputsCfg extends Record<string, ConfigRenderLambda>,
  Data,
  Plugins extends Record<string, PluginRecord> = {},
  Transfers extends Record<string, unknown> = {},
  Params = unknown,
> {
  renderingMode: BlockRenderingMode;
  dataModel: DataModel<Data, Params, Transfers>;
  /** Reference to the block kind this model implements, in `{name}@{version}` form. */
  // @todo: use blockKind, `kind` super comman word
  kind: BlockKindReference | undefined;
  outputs: OutputsCfg;
  sections: ConfigRenderLambda;
  title: ConfigRenderLambda | undefined;
  subtitle: ConfigRenderLambda | undefined;
  tags: ConfigRenderLambda | undefined;
  enrichmentTargets: ConfigRenderLambda | undefined;
  featureFlags: BlockCodeKnownFeatureFlags;
  deriveArgs: ((data: unknown) => unknown) | undefined;
  derivePrerunArgs: ((data: unknown) => unknown) | undefined;
  /** Projects block data back to this kind's params for template export. */
  deriveTemplateParams: ((data: Data) => Params) | undefined;
  /**
   * The kind's runtime check for params supplied by a template. Read off the compiled
   * kind rather than declared per block: the params contract belongs to the kind, and
   * two blocks implementing it must not be able to disagree about what a valid params
   * object is. Always present — a kind cannot omit it, and a block cannot omit a kind.
   */
  parseInitializationParams: (value: unknown) => unknown;
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
  Params = unknown,
> {
  private constructor(
    private readonly config: BlockModelV3Config<OutputsCfg, Data, Plugins, Transfers, Params>,
  ) {}

  public static readonly FEATURE_FLAGS = {
    supportsLazyState: true,
    supportsPframeQueryRanking: true,
    requiresUIAPIVersion: 3,
    requiresModelAPIVersion: BLOCK_STORAGE_FACADE_VERSION,
    requiresCreatePTable: 2,
    requiresPFramesVersion: REQUIRES_PFRAMES_VERSION,
    ...BLOCK_SERVICE_FLAGS,
  } satisfies BlockCodeKnownFeatureFlags;

  /** @deprecated Use FEATURE_FLAGS */
  public static readonly INITIAL_BLOCK_FEATURE_FLAGS = BlockModelV3.FEATURE_FLAGS;

  /**
   * Creates a new BlockModelV3 builder bound to a data model and a block kind.
   *
   * The `kind` argument is cross-checked against the kind handed to the
   * builder: its `Params` type must match at compile time (via
   * `BlockKind<Params>`), and its reference value must match at runtime. The
   * reference is baked into the config so the published manifest can advertise
   * which kind the block implements.
   *
   * @example
   * const dataModel = new DataModelBuilder({ kind })
   *   .from<BlockData>("v1")
   *   .init(({ params }) => params ?? { numbers: [], labels: [] });
   *
   * BlockModelV3.create({ dataModel, kind })
   *   .args((data) => ({ numbers: data.numbers }))
   *   .sections(() => [{ type: 'link', href: '/', label: 'Main' }])
   *   .done();
   */
  public static create<
    Data extends Record<string, unknown>,
    Params = never,
    Transfers extends Record<string, unknown> = {},
  >(args: {
    dataModel: DataModel<Data, Params, Transfers>;
    kind: BlockKind<Params>;
  }): BlockModelV3<NoOb, {}, Data, "/", {}, Transfers, Params> {
    const { dataModel, kind } = args;
    // Derive the on-wire reference from the compiled kind; the kind object has
    // no reference field of its own.
    const kindRef = formatKindRef(kind);

    // Runtime guard: the kind handed to the builder must match the kind handed to
    // create(). Nothing ties them together at the type level — they arrive as two
    // separately-passed objects — so a mismatch is only visible here. The builder's own
    // reference is still optional, because a PLUGIN data model is built without a kind
    // and has none to compare.
    if (dataModel.kindRef && dataModel.kindRef !== kindRef) {
      throw new Error(
        `Block kind mismatch: data model built for '${dataModel.kindRef}' but create() got '${kindRef}'`,
      );
    }

    return new BlockModelV3<NoOb, {}, Data, "/", {}, Transfers, Params>({
      renderingMode: "Heavy",
      dataModel,
      kind: kindRef,
      // Read off the kind, which cannot omit it — not off the data model. The two
      // are cross-checked above, so there is one source, not a precedence order.
      parseInitializationParams: kind.parseInitializationParams,
      outputs: {},
      sections: createAndRegisterRenderLambda({ handle: "sections", lambda: () => [] }, true),
      title: undefined,
      subtitle: undefined,
      tags: undefined,
      enrichmentTargets: undefined,
      featureFlags: { ...BlockModelV3.FEATURE_FLAGS },
      deriveArgs: undefined,
      derivePrerunArgs: undefined,
      deriveTemplateParams: undefined,
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
    Transfers,
    Params
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
    Transfers,
    Params
  >;
  public output(
    key: string,
    cfgOrRf: RenderFunction<Args, Data, unknown>,
    flags: ConfigRenderLambdaFlags = {},
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params> {
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
    Transfers,
    Params
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
  ): BlockModelV3<A, OutputsCfg, Data, Href, Plugins, Transfers, Params> {
    return new BlockModelV3<A, OutputsCfg, Data, Href, Plugins, Transfers, Params>({
      ...this.config,
      deriveArgs: lambda as (data: unknown) => unknown,
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
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params>({
      ...this.config,
      derivePrerunArgs: fn as (data: unknown) => unknown,
    });
  }

  /**
   * Sets the function that projects block data back to this kind's params, for
   * exporting the project as a template.
   *
   * The inverse of the data model's `init`: `init` builds data from `params`, this
   * recovers the `params` that would rebuild the current data. Return only params
   * — runtime and derived state is dropped, and the exporter supplies the rest of
   * the entry (`id`, `kind`), which this lambda cannot set.
   *
   * References are returned as ordinary `PlRef`s; the SDK rewrites them into
   * template-local form on the way out, so a block never deals with the file
   * representation.
   *
   * Required: `done()` throws without it. A block whose state cannot be reduced to
   * params returns `{}` and says so explicitly, rather than exporting an entry with
   * no params that silently applies as a default-initialized block.
   *
   * The return type is the kind's `Params`, so a block whose projection drifts
   * from its own init contract fails to compile. Available only on a
   * kind-carrying model — `create(dataModel)` without a kind leaves `Params` as
   * `unknown` and this method cannot be type-checked against anything.
   *
   * @example
   * BlockModelV3.create({ dataModel, kind })
   *   .args((data) => ({ numbers: data.numbers }))
   *   .templateParams((data) => ({ sources: data.sources }))
   *   .done();
   */
  public templateParams(
    fn: (data: Data) => Params,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params>({
      ...this.config,
      deriveTemplateParams: fn,
    });
  }

  /** Sets the lambda to generate list of sections in the left block overviews panel. */
  public sections<
    const Ret extends SectionsExpectedType,
    const RF extends RenderFunction<Args, Data, Ret>,
  >(
    rf: RF,
  ): BlockModelV3<Args, OutputsCfg, Data, DeriveHref<ReturnType<RF>>, Plugins, Transfers, Params> {
    return new BlockModelV3<
      Args,
      OutputsCfg,
      Data,
      DeriveHref<ReturnType<RF>>,
      Plugins,
      Transfers,
      Params
    >({
      ...this.config,
      // Replace the default sections callback with the user-provided one
      sections: createAndRegisterRenderLambda(
        {
          handle: "sections",
          lambda: () => rf(new BlockRenderCtx<Args, Data>()),
        },
        true,
      ),
    });
  }

  /** Sets a rendering function to derive block title, shown for the block in the left blocks-overview panel. */
  public title(
    rf: RenderFunction<Args, Data, string>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params>({
      ...this.config,
      title: createAndRegisterRenderLambda({
        handle: "title",
        lambda: () => rf(new BlockRenderCtx<Args, Data>()),
      }),
    });
  }

  public subtitle(
    rf: RenderFunction<Args, Data, string>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params>({
      ...this.config,
      subtitle: createAndRegisterRenderLambda({
        handle: "subtitle",
        lambda: () => rf(new BlockRenderCtx<Args, Data>()),
      }),
    });
  }

  public tags(
    rf: RenderFunction<Args, Data, string[]>,
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params>({
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
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params>({
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
  ): BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params> {
    return new BlockModelV3<Args, OutputsCfg, Data, Href, Plugins, Transfers, Params>({
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
    PPublicOutputs extends PluginPublicOutputs,
    PTransferData,
    PluginModelServices,
    PluginUiServices,
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
      PPublicOutputs,
      PTransferData,
      PluginModelServices,
      PluginUiServices
    >,
    params?: ParamsInput<PParams, Args, Data>,
  ): BlockModelV3<
    Args,
    OutputsCfg,
    Data,
    Href,
    Plugins & {
      [K in PluginId]: PluginRecord<
        PData,
        PParams,
        POutputs,
        PPublicOutputs,
        PluginModelServices,
        PluginUiServices
      >;
    },
    Omit<Transfers, PluginId>,
    Params
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
    Record<string, unknown>,
    Params
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
    PlatformaV3<
      Data,
      Args,
      InferOutputsFromLambdas<OutputsCfg>,
      Href,
      Plugins,
      BlockDefaultUiServices
    >
  > {
    if (this.config.deriveArgs === undefined) throw new Error("Args rendering function not set.");
    if (this.config.deriveTemplateParams === undefined)
      throw new Error(
        "templateParams() not set. Every block must project its state back to its kind's params, " +
          "so a project can be exported as a template and re-applied; a block whose state carries " +
          "nothing worth restoring returns {}.",
      );

    const apiVersion = 3;

    // Build plugin registry
    const { plugins } = this.config;
    const pluginRegistry: Record<string, PluginName> = {};
    const pluginHandles = Object.keys(plugins) as PluginHandle[];
    for (const handle of pluginHandles) {
      pluginRegistry[handle] = plugins[handle].model.name;
    }

    const {
      dataModel,
      deriveArgs,
      derivePrerunArgs,
      deriveTemplateParams,
      parseInitializationParams,
    } = this.config;

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
        deriveArgsFromStorage(storageJson, deriveArgs),
      [BlockStorageFacadeCallbacks.PrerunArgsDerive]: (storageJson) =>
        derivePrerunArgsFromStorage(storageJson, deriveArgs, derivePrerunArgs),
      [BlockStorageFacadeCallbacks.InitializationParamsDerive]: (storageJson) =>
        deriveTemplateParamsFromStorage(
          storageJson,
          deriveTemplateParams as (data: unknown) => unknown,
        ),
      [BlockStorageFacadeCallbacks.StorageInitialFromParams]: (paramsJson) =>
        createInitialStorageFromParams(paramsJson, {
          getBlockDataFromParams: (params) => dataModel.getDataFromParams(params),
          getPluginRegistry: () => pluginRegistry,
          createPluginData: (handle) => getPlugin(handle).model.getDefaultData(),
          parseInitializationParams,
        }),
      [BlockStorageFacadeCallbacks.InitializationParamsRelocate]: (paramsJson, blockIdsJson) =>
        relocateTemplateParams(paramsJson, blockIdsJson),
      [BlockStorageFacadeCallbacks.InitializationParamsValidate]: (paramsJson) =>
        validateTemplateParamsJson(paramsJson, parseInitializationParams),
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
          withStatus: true,
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

        // Block-kind identity, baked at the container level beside `code`
        // (orthogonal to which render envelope applies). Rides into model.json
        // via the JSON.stringify(config) in build-model.ts — no write-path change.
        kind: this.config.kind,

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
          pluginPublicOutputs: Object.fromEntries(
            pluginHandles.map((handle) => [handle, plugins[handle].model.publicOutputDef]),
          ),
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
      deriveArgs: ((data: unknown) => unknown) | undefined;
      derivePrerunArgs: ((data: unknown) => unknown) | undefined;
      deriveTemplateParams: ((data: _TestData) => unknown) | undefined;
      parseInitializationParams: (value: unknown) => unknown;
      dataModel: DataModel<_TestData, unknown, {}>;
      kind: BlockKindReference | undefined;
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
