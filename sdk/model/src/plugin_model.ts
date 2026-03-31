/**
 * PluginModel - Builder for creating plugin types with data model and outputs.
 *
 * Plugins are UI components with their own model logic and persistent state.
 * Block developers register plugin instances via BlockModelV3.plugin() method.
 *
 * @module plugin_model
 */

import type { BlockCodeKnownFeatureFlags, OutputWithStatus } from "@milaboratories/pl-model-common";
import {
  type DataModel,
  DataModelBuilder,
  type DataRecoverFn,
  type DataVersioned,
  type TransferTarget,
} from "./block_migrations";
import { type PluginName, DATA_MODEL_LEGACY_VERSION } from "./block_storage";
import type { PluginFactoryLike } from "./plugin_handle";
import type { PluginRenderCtx } from "./render";

/** Symbol for internal builder creation method */
const FROM_BUILDER = Symbol("fromBuilder");

/** Symbol for internal plugin model creation — not accessible to external consumers */
export const CREATE_PLUGIN_MODEL = Symbol("createPluginModel");

/** Sentinel for PluginInstance without transferAt — no transfer possible. */
const NO_TRANSFER_VERSION = "";

export type PluginData = Record<string, unknown>;
export type PluginParams = undefined | Record<string, unknown>;
export type PluginOutputs = Record<string, unknown>;
export type PluginConfig = undefined | Record<string, unknown>;

/**
 * Plugin data model with typed migration chain and config-aware initialization.
 *
 * @typeParam Data - Current (latest) plugin data type
 * @typeParam Versions - Map of version keys to their data types (accumulated by the chain)
 * @typeParam Config - Config type passed to init function (undefined if none)
 */
export class PluginDataModel<
  Data extends PluginData,
  Versions extends Record<string, unknown> = {},
  Config = undefined,
> {
  readonly dataModel: DataModel<Data>;
  private readonly configInitFn: (config?: Config) => Data;

  /** @internal Phantom field to anchor the Versions type parameter. */
  declare readonly __versions?: Versions;

  private constructor(dataModel: DataModel<Data>, configInitFn: (config?: Config) => Data) {
    this.dataModel = dataModel;
    this.configInitFn = configInitFn;
  }

  /** @internal */
  static [FROM_BUILDER]<Data extends PluginData, Versions extends Record<string, unknown>, Config>(
    dataModel: DataModel<Data>,
    configInitFn: (config?: Config) => Data,
  ): PluginDataModel<Data, Versions, Config> {
    return new PluginDataModel<Data, Versions, Config>(dataModel, configInitFn);
  }

  /** Create fresh data with optional config. */
  getDefaultData(config?: Config): DataVersioned<Data> {
    const data = this.configInitFn(config);
    return { version: this.dataModel.version, data };
  }
}

/** Internal state for plugin data model chain. */
type PluginChainState = {
  initialVersion: string;
  migrations: Array<{ toVersion: string; fn: (data: unknown) => unknown }>;
  recoverFn?: (version: string, data: unknown) => unknown;
  recoverAtIndex?: number;
};

/** Version → persisted data shape for each migration step (third generic of `PluginModel.define` when `data` is a `PluginDataModel`). */
export type PluginDataModelVersions<
  M extends PluginDataModel<PluginData, Record<string, unknown>, unknown>,
> = M extends PluginDataModel<PluginData, infer Versions, unknown> ? Versions : never;

/**
 * Builder for creating PluginDataModel with type-safe migrations.
 * Mirrors DataModelBuilder — same .from(), .migrate(), .recover(), .init() chain.
 *
 * @example
 * const pluginData = new PluginDataModelBuilder()
 *   .from<TableData>("v1")
 *   .migrate<FilteredTableData>("v2", (v1) => ({ ...v1, filters: [] }))
 *   .init<TableConfig>((config?) => ({
 *     state: createDefaultState(config?.ops),
 *     filters: [],
 *   }));
 */
export class PluginDataModelBuilder {
  from<Data extends PluginData, const V extends string>(
    version: V,
  ): PluginDataModelInitialChain<Data, Record<V, Data>> {
    return PluginDataModelInitialChain[FROM_BUILDER]<Data, Record<V, Data>>({
      initialVersion: version,
      migrations: [],
    });
  }
}

/**
 * Chain returned by .migrate(). Supports .migrate(), .recover(), .init().
 * No .upgradeLegacy() — that is only available on the initial chain.
 */
export class PluginDataModelChain<
  Data extends PluginData,
  Versions extends Record<string, unknown>,
> {
  protected constructor(protected readonly state: PluginChainState) {}

  /** @internal */
  static [FROM_BUILDER]<Data extends PluginData, Versions extends Record<string, unknown>>(
    state: PluginChainState,
  ): PluginDataModelChain<Data, Versions> {
    return new PluginDataModelChain(state);
  }

  /**
   * Add a migration step transforming data from the current version to the next.
   */
  migrate<Next extends PluginData, const NextV extends string>(
    version: NextV,
    fn: (current: Data) => Next,
  ): PluginDataModelChain<Next, Versions & Record<NextV, Next>> {
    return PluginDataModelChain[FROM_BUILDER]<Next, Versions & Record<NextV, Next>>({
      ...this.state,
      migrations: [
        ...this.state.migrations,
        { toVersion: version, fn: fn as (data: unknown) => unknown },
      ],
    });
  }

  /**
   * Set a recovery handler for unknown or legacy versions.
   * Can only be called once — the returned chain has no recover() method.
   */
  recover(fn: DataRecoverFn<Data>): PluginDataModelWithRecover<Data, Versions> {
    return PluginDataModelWithRecover[FROM_BUILDER]<Data, Versions>({
      ...this.state,
      recoverFn: fn as (version: string, data: unknown) => unknown,
      recoverAtIndex: this.state.migrations.length,
    });
  }

  /** Finalize the PluginDataModel. */
  init<Config = undefined>(fn: (config?: Config) => Data): PluginDataModel<Data, Versions, Config> {
    return buildPluginDataModel(this.state, fn);
  }
}

/**
 * Initial chain returned by new PluginDataModelBuilder().from().
 * Extends PluginDataModelChain with .upgradeLegacy() — available only before
 * any .migrate() calls, matching the block's DataModelInitialChain pattern.
 */
export class PluginDataModelInitialChain<
  Data extends PluginData,
  Versions extends Record<string, unknown>,
> extends PluginDataModelChain<Data, Versions> {
  /** @internal */
  static override [FROM_BUILDER]<Data extends PluginData, Versions extends Record<string, unknown>>(
    state: PluginChainState,
  ): PluginDataModelInitialChain<Data, Versions> {
    return new PluginDataModelInitialChain(state);
  }

  /**
   * Handle data from a previous plugin type occupying this slot.
   * Prepends a migration from DATA_MODEL_LEGACY_VERSION to the initial version.
   * When a plugin type changes, the old data arrives with DATA_MODEL_LEGACY_VERSION —
   * this function transforms it into the initial version, then the normal chain runs.
   *
   * Must be called right after .from() — not available after .migrate().
   * Mutually exclusive with recover().
   *
   * @param fn - Transform from old plugin's raw data to this plugin's initial data type
   */
  upgradeLegacy(fn: (data: unknown) => Data): PluginDataModelWithRecover<Data, Versions> {
    return PluginDataModelWithRecover[FROM_BUILDER]<Data, Versions>({
      ...this.state,
      migrations: [
        { toVersion: this.state.initialVersion, fn: fn as (data: unknown) => unknown },
        ...this.state.migrations,
      ],
      initialVersion: DATA_MODEL_LEGACY_VERSION,
    });
  }
}

/**
 * Chain after .recover() — supports .migrate(), .init(). No second recover().
 */
export class PluginDataModelWithRecover<
  Data extends PluginData,
  Versions extends Record<string, unknown>,
> {
  private constructor(private readonly state: PluginChainState) {}

  /** @internal */
  static [FROM_BUILDER]<Data extends PluginData, Versions extends Record<string, unknown>>(
    state: PluginChainState,
  ): PluginDataModelWithRecover<Data, Versions> {
    return new PluginDataModelWithRecover(state);
  }

  migrate<Next extends PluginData, const NextV extends string>(
    version: NextV,
    fn: (current: Data) => Next,
  ): PluginDataModelWithRecover<Next, Versions & Record<NextV, Next>> {
    return PluginDataModelWithRecover[FROM_BUILDER]<Next, Versions & Record<NextV, Next>>({
      ...this.state,
      migrations: [
        ...this.state.migrations,
        { toVersion: version, fn: fn as (data: unknown) => unknown },
      ],
    });
  }

  init<Config = undefined>(fn: (config?: Config) => Data): PluginDataModel<Data, Versions, Config> {
    return buildPluginDataModel(this.state, fn);
  }
}

/**
 * Builds a PluginDataModel by replaying the stored chain state through DataModelBuilder.
 * @internal
 */
function buildPluginDataModel<
  Data extends PluginData,
  Versions extends Record<string, unknown>,
  Config,
>(
  state: PluginChainState,
  configInitFn: (config?: Config) => Data,
): PluginDataModel<Data, Versions, Config> {
  // Build inner DataModel by replaying migrations through DataModelBuilder chain.
  // Uses `any` internally — type safety is maintained by the public chain types.
  let chain: any = new DataModelBuilder().from(state.initialVersion);

  for (let i = 0; i < state.migrations.length; i++) {
    if (state.recoverFn !== undefined && state.recoverAtIndex === i) {
      chain = chain.recover(state.recoverFn);
    }
    chain = chain.migrate(state.migrations[i].toVersion, state.migrations[i].fn);
  }

  // If recover was placed at or after the last migration
  if (state.recoverFn !== undefined && state.recoverAtIndex === state.migrations.length) {
    chain = chain.recover(state.recoverFn);
  }

  const dataModel: DataModel<Data> = chain.init(() => configInitFn());

  return PluginDataModel[FROM_BUILDER]<Data, Versions, Config>(dataModel, configInitFn);
}

/**
 * A named plugin instance created by `factory.create({ pluginId, ... })`.
 * Passed to both `.transfer()` (on migration chain) and `.plugin()` (on BlockModelV3).
 * Implements TransferTarget so the migration chain can accept it.
 *
 * @typeParam Id - Plugin instance ID literal type
 * @typeParam Data - Plugin data type
 * @typeParam Params - Plugin params type
 * @typeParam Outputs - Plugin outputs type
 * @typeParam TransferData - Type of data entering the plugin via transfer (never if no transfer)
 */
export class PluginInstance<
  Id extends string = string,
  Data extends PluginData = PluginData,
  Params extends PluginParams = undefined,
  Outputs extends PluginOutputs = PluginOutputs,
  TransferData = never,
> implements TransferTarget<Id, TransferData> {
  readonly id: Id;
  readonly transferVersion: string;
  /** @internal Phantom for type inference of Data/Params/Outputs; never set at runtime. */
  readonly __instanceTypes?: { data: Data; params: Params; outputs: Outputs };
  private readonly factory: PluginModelFactory<Data, Params, Outputs, any, any>;
  private readonly config: any;

  private constructor(
    id: Id,
    factory: PluginModelFactory<Data, Params, Outputs, any, any>,
    transferVersion: string,
    config?: any,
  ) {
    this.id = id;
    this.factory = factory;
    this.transferVersion = transferVersion;
    this.config = config;
  }

  /** @internal */
  static [FROM_BUILDER]<
    Id extends string,
    Data extends PluginData,
    Params extends PluginParams,
    Outputs extends PluginOutputs,
    TransferData,
  >(
    id: Id,
    factory: PluginModelFactory<Data, Params, Outputs, any, any>,
    transferVersion: string,
    config?: any,
  ): PluginInstance<Id, Data, Params, Outputs, TransferData> {
    return new PluginInstance(id, factory, transferVersion, config);
  }

  /** @internal Create a PluginModel from this instance. Used by BlockModelV3.plugin(). */
  [CREATE_PLUGIN_MODEL](): PluginModel<Data, Params, Outputs> {
    return this.factory[CREATE_PLUGIN_MODEL](this.config);
  }
}

/**
 * Configured plugin instance returned by PluginModelFactory[CREATE_PLUGIN_MODEL]().
 * Contains the plugin's name, data model, and output definitions.
 */
export class PluginModel<
  Data extends PluginData = PluginData,
  Params extends PluginParams = undefined,
  Outputs extends PluginOutputs = PluginOutputs,
> {
  /** Globally unique plugin name */
  readonly name: PluginName;
  /** Data model instance for this plugin */
  readonly dataModel: DataModel<Data>;
  /** Output definitions - functions that compute outputs from plugin context */
  readonly outputs: {
    [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
  };
  /** Per-output flags (e.g. withStatus) */
  readonly outputFlags: Record<string, { withStatus: boolean }>;
  /** Feature flags declared by this plugin */
  readonly featureFlags?: BlockCodeKnownFeatureFlags;
  /** Create fresh default data. Config (if any) is captured at creation time. */
  readonly getDefaultData: () => DataVersioned<Data>;

  private constructor(options: {
    name: PluginName;
    dataModel: DataModel<Data>;
    outputs: {
      [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
    };
    outputFlags: Record<string, { withStatus: boolean }>;
    featureFlags?: BlockCodeKnownFeatureFlags;
    getDefaultData: () => DataVersioned<Data>;
  }) {
    this.name = options.name;
    this.dataModel = options.dataModel;
    this.outputs = options.outputs;
    this.outputFlags = options.outputFlags;
    this.featureFlags = options.featureFlags;
    this.getDefaultData = options.getDefaultData;
  }

  /**
   * Internal method for creating PluginModel from factory.
   * Uses Symbol key to prevent external access.
   * @internal
   */
  static [FROM_BUILDER]<
    Data extends PluginData,
    Params extends PluginParams,
    Outputs extends PluginOutputs,
  >(options: {
    name: PluginName;
    dataModel: DataModel<Data>;
    outputs: {
      [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
    };
    outputFlags: Record<string, { withStatus: boolean }>;
    featureFlags?: BlockCodeKnownFeatureFlags;
    getDefaultData: () => DataVersioned<Data>;
  }): PluginModel<Data, Params, Outputs> {
    return new PluginModel<Data, Params, Outputs>(options);
  }

  /**
   * Creates a new PluginModelBuilder with a PluginDataModel (supports transfer / config).
   *
   * @example
   * const pluginData = new PluginDataModelBuilder().from<TableData>("v1")
   *   .migrate<FilteredTableData>("v2", (v1) => ({ ...v1, filters: [] }))
   *   .init<TableConfig>((config?) => ({
   *     state: createDefaultState(config?.ops),
   *     filters: [],
   *   }));
   *
   * const myPlugin = PluginModel.define({
   *   name: 'myPlugin' as PluginName,
   *   data: pluginData,
   * }).build();
   */
  static define<
    Data extends PluginData,
    Params extends PluginParams = undefined,
    Versions extends Record<string, unknown> = {},
    Config extends PluginConfig = undefined,
  >(options: {
    name: PluginName;
    data: PluginDataModel<Data, Versions, Config>;
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModelBuilder<Data, Params, {}, Config, Versions>;
  /**
   * Creates a new PluginModelBuilder with a data model factory function (backward compatible).
   *
   * @example
   * const myPlugin = PluginModel.define({
   *   name: 'myPlugin' as PluginName,
   *   data: (cfg) => dataModelChain.init(() => ({ value: cfg.defaultValue })),
   * }).build();
   */
  static define<
    Data extends PluginData,
    Params extends PluginParams = undefined,
    Config extends PluginConfig = undefined,
  >(options: {
    name: PluginName;
    data: (config?: Config) => DataModel<Data>;
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModelBuilder<Data, Params, {}, Config, {}>;
  static define(options: {
    name: PluginName;
    data: PluginDataModel<any, any, any> | ((config?: any) => DataModel<any>);
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModelBuilder {
    if (options.data instanceof PluginDataModel) {
      const pdm = options.data;
      return PluginModelBuilder[FROM_BUILDER]({
        name: options.name,
        dataFn: () => pdm.dataModel,
        getDefaultDataFn: (config: any) => pdm.getDefaultData(config),
        featureFlags: options.featureFlags,
      });
    }
    return PluginModelBuilder[FROM_BUILDER]({
      name: options.name,
      dataFn: options.data,
      featureFlags: options.featureFlags,
    });
  }
}

/** Plugin factory returned by PluginModelBuilder.build(). */
export interface PluginFactory<
  Data extends PluginData = PluginData,
  Params extends PluginParams = undefined,
  Outputs extends PluginOutputs = PluginOutputs,
  Config extends PluginConfig = undefined,
  Versions extends Record<string, unknown> = {},
> extends PluginFactoryLike<Data, Params, Outputs> {
  /** Create a named plugin instance, optionally with transfer at a specific version. */
  create<const Id extends string, const V extends string & keyof Versions = never>(options: {
    pluginId: Id;
    transferAt?: V;
    config?: Config;
  }): PluginInstance<Id, Data, Params, Outputs, Versions[V]>;

  /**
   * @internal Phantom field for structural type extraction.
   * Enables InferFactoryData/InferFactoryOutputs to work via PluginFactoryLike.
   */
  readonly __types?: {
    data: Data;
    params: Params;
    outputs: Outputs;
    config: Config;
    versions: Versions;
  };
}

class PluginModelFactory<
  Data extends PluginData = PluginData,
  Params extends PluginParams = undefined,
  Outputs extends PluginOutputs = PluginOutputs,
  Config extends PluginConfig = undefined,
  Versions extends Record<string, unknown> = {},
> implements PluginFactory<Data, Params, Outputs, Config, Versions> {
  private readonly name: PluginName;
  private readonly dataFn: (config?: Config) => DataModel<Data>;
  private readonly getDefaultDataFn?: (config?: Config) => DataVersioned<Data>;
  readonly outputs: {
    [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
  };
  private readonly outputFlags: Record<string, { withStatus: boolean }>;
  private readonly featureFlags?: BlockCodeKnownFeatureFlags;

  private constructor(options: {
    name: PluginName;
    dataFn: (config?: Config) => DataModel<Data>;
    getDefaultDataFn?: (config?: Config) => DataVersioned<Data>;
    outputs: {
      [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
    };
    outputFlags: Record<string, { withStatus: boolean }>;
    featureFlags?: BlockCodeKnownFeatureFlags;
  }) {
    this.name = options.name;
    this.dataFn = options.dataFn;
    this.getDefaultDataFn = options.getDefaultDataFn;
    this.outputs = options.outputs;
    this.outputFlags = options.outputFlags;
    this.featureFlags = options.featureFlags;
  }

  /** @internal */
  static [FROM_BUILDER]<
    Data extends PluginData,
    Params extends PluginParams,
    Outputs extends PluginOutputs,
    Config extends PluginConfig,
    Versions extends Record<string, unknown>,
  >(options: {
    name: PluginName;
    dataFn: (config?: Config) => DataModel<Data>;
    getDefaultDataFn?: (config?: Config) => DataVersioned<Data>;
    outputs: {
      [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
    };
    outputFlags: Record<string, { withStatus: boolean }>;
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModelFactory<Data, Params, Outputs, Config, Versions> {
    return new PluginModelFactory(options);
  }

  create<const Id extends string, const V extends string & keyof Versions = never>(options: {
    pluginId: Id;
    transferAt?: V;
    config?: Config;
  }): PluginInstance<Id, Data, Params, Outputs, Versions[V]> {
    const transferVersion = options.transferAt ?? NO_TRANSFER_VERSION;
    return PluginInstance[FROM_BUILDER]<Id, Data, Params, Outputs, Versions[V]>(
      options.pluginId as Id,
      this as any,
      transferVersion,
      options.config,
    );
  }

  /** @internal Create a PluginModel from config. Config is captured in getDefaultData closure. */
  [CREATE_PLUGIN_MODEL](config?: Config): PluginModel<Data, Params, Outputs> {
    const dataModel = this.dataFn(config);
    const getDefaultDataFn = this.getDefaultDataFn;
    return PluginModel[FROM_BUILDER]<Data, Params, Outputs>({
      name: this.name,
      dataModel,
      outputs: this.outputs,
      outputFlags: this.outputFlags,
      featureFlags: this.featureFlags,
      getDefaultData: getDefaultDataFn
        ? () => getDefaultDataFn(config)
        : () => dataModel.getDefaultData(),
    });
  }
}

/**
 * Builder for creating PluginType with type-safe output definitions.
 *
 * Use `PluginModel.define()` to create a builder instance.
 *
 * @typeParam Data - Plugin's persistent data type
 * @typeParam Params - Params derived from block's RenderCtx (optional)
 * @typeParam Config - Static configuration passed to plugin factory (optional)
 * @typeParam Outputs - Accumulated output types
 * @typeParam Versions - Version map from PluginDataModel (empty for function-based data)
 *
 * @example
 * const dataTable = PluginModel.define({
 *     name: 'dataTable' as PluginName,
 *     data: pluginDataModel,
 *   })
 *   .output('model', (ctx) => createTableModel(ctx))
 *   .build();
 */
class PluginModelBuilder<
  Data extends PluginData = PluginData,
  Params extends PluginParams = undefined,
  Outputs extends PluginOutputs = PluginOutputs,
  Config extends PluginConfig = undefined,
  Versions extends Record<string, unknown> = {},
> {
  private readonly name: PluginName;
  private readonly dataFn: (config?: Config) => DataModel<Data>;
  private readonly getDefaultDataFn?: (config?: Config) => DataVersioned<Data>;
  private readonly outputs: {
    [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
  };
  private readonly outputFlags: Record<string, { withStatus: boolean }>;
  private readonly featureFlags?: BlockCodeKnownFeatureFlags;

  private constructor(options: {
    name: PluginName;
    dataFn: (config?: Config) => DataModel<Data>;
    getDefaultDataFn?: (config?: Config) => DataVersioned<Data>;
    outputs?: {
      [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
    };
    outputFlags?: Record<string, { withStatus: boolean }>;
    featureFlags?: BlockCodeKnownFeatureFlags;
  }) {
    this.name = options.name;
    this.dataFn = options.dataFn;
    this.getDefaultDataFn = options.getDefaultDataFn;
    this.outputs =
      options.outputs ??
      ({} as {
        [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
      });
    this.outputFlags = options.outputFlags ?? {};
    this.featureFlags = options.featureFlags;
  }

  /** @internal */
  static [FROM_BUILDER]<
    Data extends PluginData,
    Params extends PluginParams,
    Outputs extends PluginOutputs,
    Config extends PluginConfig,
    Versions extends Record<string, unknown> = {},
  >(options: {
    name: PluginName;
    dataFn: (config?: Config) => DataModel<Data>;
    getDefaultDataFn?: (config?: Config) => DataVersioned<Data>;
    outputs?: {
      [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
    };
    outputFlags?: Record<string, { withStatus: boolean }>;
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModelBuilder<Data, Params, Outputs, Config, Versions> {
    return new PluginModelBuilder(options);
  }

  /**
   * Adds an output to the plugin.
   *
   * @param key - Output name
   * @param fn - Function that computes the output value from plugin context
   * @returns PluginModel with the new output added
   *
   * @example
   * .output('model', (ctx) => createModel(ctx.params.columns, ctx.data.state))
   * .output('isReady', (ctx) => ctx.params.columns !== undefined)
   */
  output<const Key extends string, T>(
    key: Key,
    fn: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => T,
  ): PluginModelBuilder<Data, Params, Outputs & { [K in Key]: T }, Config, Versions> {
    return new PluginModelBuilder<Data, Params, Outputs & { [K in Key]: T }, Config, Versions>({
      name: this.name,
      dataFn: this.dataFn,
      getDefaultDataFn: this.getDefaultDataFn,
      featureFlags: this.featureFlags,
      outputs: {
        ...this.outputs,
        [key]: fn,
      } as {
        [K in keyof (Outputs & { [P in Key]: T })]: (
          ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>,
        ) => (Outputs & { [P in Key]: T })[K];
      },
      outputFlags: { ...this.outputFlags, [key]: { withStatus: false } },
    });
  }

  /**
   * Adds an output wrapped with status information to the plugin.
   *
   * The UI receives the full {@link OutputWithStatus} object instead of an unwrapped value,
   * allowing it to distinguish between pending, success, and error states.
   *
   * @param key - Output name
   * @param fn - Function that computes the output value from plugin context
   * @returns PluginModel with the new status-wrapped output added
   *
   * @example
   * .outputWithStatus('table', (ctx) => {
   *   const pCols = ctx.params.pFrame?.getPColumns();
   *   if (pCols === undefined) return undefined;
   *   return createPlDataTableV2(ctx, pCols, ctx.data.tableState);
   * })
   */
  outputWithStatus<const Key extends string, T>(
    key: Key,
    fn: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => T,
  ): PluginModelBuilder<
    Data,
    Params,
    Outputs & { [K in Key]: OutputWithStatus<T> },
    Config,
    Versions
  > {
    return new PluginModelBuilder<
      Data,
      Params,
      Outputs & { [K in Key]: OutputWithStatus<T> },
      Config,
      Versions
    >({
      name: this.name,
      dataFn: this.dataFn,
      getDefaultDataFn: this.getDefaultDataFn,
      featureFlags: this.featureFlags,
      outputs: {
        ...this.outputs,
        [key]: fn,
      } as {
        [K in keyof (Outputs & { [P in Key]: OutputWithStatus<T> })]: (
          ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>,
        ) => (Outputs & { [P in Key]: OutputWithStatus<T> })[K];
      },
      outputFlags: { ...this.outputFlags, [key]: { withStatus: true } },
    });
  }

  /**
   * Finalizes the plugin definition and returns a PluginFactory.
   *
   * @returns Plugin factory that creates named plugin instances via .create()
   *
   * @example
   * const myPlugin = PluginModel.define({ ... })
   *   .output('value', (ctx) => ctx.data.value)
   *   .build();
   *
   * // Create a named instance:
   * const table = myPlugin.create({ pluginId: 'mainTable', config: { ... } });
   */
  build(): PluginFactory<Data, Params, Outputs, Config, Versions> {
    return PluginModelFactory[FROM_BUILDER]<Data, Params, Outputs, Config, Versions>({
      name: this.name,
      dataFn: this.dataFn,
      getDefaultDataFn: this.getDefaultDataFn,
      outputs: this.outputs,
      outputFlags: this.outputFlags,
      featureFlags: this.featureFlags,
    });
  }
}
