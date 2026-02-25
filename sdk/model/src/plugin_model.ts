/**
 * PluginModel - Builder for creating plugin types with data model and outputs.
 *
 * Plugins are UI components with their own model logic and persistent state.
 * Block developers register plugin instances via BlockModelV3.plugin() method.
 *
 * @module plugin_model
 */

import type { BlockCodeKnownFeatureFlags } from "@milaboratories/pl-model-common";
import type { DataModel } from "./block_migrations";
import type { PluginName } from "./block_storage";
import type { PluginFactoryLike } from "./plugin_handle";
import type { PluginRenderCtx } from "./render";

/** Symbol for internal builder creation method */
const FROM_BUILDER = Symbol("fromBuilder");

export type PluginData = Record<string, unknown>;
export type PluginParams = undefined | Record<string, unknown>;
export type PluginOutputs = Record<string, unknown>;
export type PluginConfig = undefined | Record<string, unknown>;

/**
 * Configured plugin instance returned by PluginModelFactory.create().
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
  /** Feature flags declared by this plugin */
  readonly featureFlags?: BlockCodeKnownFeatureFlags;

  private constructor(options: {
    name: PluginName;
    dataModel: DataModel<Data>;
    outputs: {
      [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
    };
    featureFlags?: BlockCodeKnownFeatureFlags;
  }) {
    this.name = options.name;
    this.dataModel = options.dataModel;
    this.outputs = options.outputs;
    this.featureFlags = options.featureFlags;
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
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModel<Data, Params, Outputs> {
    return new PluginModel<Data, Params, Outputs>(options);
  }

  /**
   * Creates a new PluginModelBuilder for building plugin definitions.
   *
   * @param options.name - Globally unique plugin name
   * @param options.data - Factory function that creates the data model from config
   * @returns PluginModelBuilder for chaining output definitions
   *
   * @example
   * const dataModelChain = new DataModelBuilder().from<MyData>("v1");
   *
   * const myPlugin = PluginModel.define({
   *   name: 'myPlugin' as PluginName,
   *   data: (cfg) => dataModelChain.init(() => ({ value: cfg.defaultValue })),
   * })
   *   .output('computed', (ctx) => ctx.data.value * ctx.params.multiplier)
   *   .build();
   */
  static define<
    Data extends PluginData,
    Params extends PluginParams,
    Config extends PluginConfig,
  >(options: {
    name: PluginName;
    data: (config?: Config) => DataModel<Data>;
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModelBuilder<Data, Params, {}, Config> {
    return PluginModelBuilder[FROM_BUILDER](options);
  }
}

/** Plugin factory returned by PluginModelBuilder.build(). */
export interface PluginFactory<
  Data extends PluginData = PluginData,
  Params extends PluginParams = undefined,
  Outputs extends PluginOutputs = PluginOutputs,
  Config extends PluginConfig = undefined,
> extends PluginFactoryLike {
  create(config?: Config): PluginModel<Data, Params, Outputs>;
  /**
   * @internal Phantom field for structural type extraction.
   * Enables InferFactoryData/InferFactoryOutputs to work via PluginFactoryLike.
   */
  readonly __types?: { data: Data; params: Params; outputs: Outputs; config: Config };
}

class PluginModelFactory<
  Data extends PluginData = PluginData,
  Params extends PluginParams = undefined,
  Outputs extends PluginOutputs = PluginOutputs,
  Config extends PluginConfig = undefined,
> implements PluginFactory<Data, Params, Outputs, Config> {
  private readonly name: PluginName;
  private readonly data: (config?: Config) => DataModel<Data>;
  private readonly outputs: {
    [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
  };
  private readonly featureFlags?: BlockCodeKnownFeatureFlags;

  constructor(options: {
    name: PluginName;
    data: (config?: Config) => DataModel<Data>;
    outputs: {
      [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
    };
    featureFlags?: BlockCodeKnownFeatureFlags;
  }) {
    this.name = options.name;
    this.data = options.data;
    this.outputs = options.outputs;
    this.featureFlags = options.featureFlags;
  }

  /** Create a configured PluginModel instance */
  create(config?: Config): PluginModel<Data, Params, Outputs> {
    return PluginModel[FROM_BUILDER]<Data, Params, Outputs>({
      name: this.name,
      dataModel: this.data(config),
      outputs: this.outputs,
      featureFlags: this.featureFlags,
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
 *
 * @example
 * const dataModelChain = new DataModelBuilder().from<TableData>("v1");
 *
 * const dataTable = PluginModel.define<TableData, TableParams, TableConfig>({
 *     name: 'dataTable' as PluginName,
 *     data: (cfg) => {
 *       return dataModelChain.init(() => ({ state: createInitialState(cfg.ops) }));
 *     },
 *   })
 *   .output('model', (ctx) => createTableModel(ctx))
 *   .build();
 */
class PluginModelBuilder<
  Data extends PluginData = PluginData,
  Params extends PluginParams = undefined,
  Outputs extends PluginOutputs = PluginOutputs,
  Config extends PluginConfig = undefined,
> {
  private readonly name: PluginName;
  private readonly data: (config?: Config) => DataModel<Data>;
  private readonly outputs: {
    [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
  };
  private readonly featureFlags?: BlockCodeKnownFeatureFlags;

  private constructor(options: {
    name: PluginName;
    data: (config?: Config) => DataModel<Data>;
    outputs?: {
      [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
    };
    featureFlags?: BlockCodeKnownFeatureFlags;
  }) {
    this.name = options.name;
    this.data = options.data;
    this.outputs =
      options.outputs ??
      ({} as {
        [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
      });
    this.featureFlags = options.featureFlags;
  }

  /**
   * Internal method for creating PluginModelBuilder.
   * Uses Symbol key to prevent external access.
   * @internal
   */
  static [FROM_BUILDER]<
    Data extends PluginData,
    Params extends PluginParams,
    Outputs extends PluginOutputs,
    Config extends PluginConfig,
  >(options: {
    name: PluginName;
    data: (config?: Config) => DataModel<Data>;
    outputs?: {
      [K in keyof Outputs]: (ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>) => Outputs[K];
    };
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModelBuilder<Data, Params, Outputs, Config> {
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
  ): PluginModelBuilder<Data, Params, Outputs & { [K in Key]: T }, Config> {
    return new PluginModelBuilder<Data, Params, Outputs & { [K in Key]: T }, Config>({
      name: this.name,
      data: this.data,
      featureFlags: this.featureFlags,
      outputs: {
        ...this.outputs,
        [key]: fn,
      } as {
        [K in keyof (Outputs & { [P in Key]: T })]: (
          ctx: PluginRenderCtx<PluginFactoryLike<Data, Params>>,
        ) => (Outputs & { [P in Key]: T })[K];
      },
    });
  }

  /**
   * Finalizes the plugin definition and returns a ConfigurablePluginModel.
   *
   * @returns Callable plugin factory that accepts config and returns PluginModel
   *
   * @example
   * const myPlugin = new PluginModelBuilder('myPlugin', () => dataModel)
   *   .output('value', (ctx) => ctx.data.value)
   *   .build();
   *
   * // Later, call create() with config to get a configured instance:
   * const configured = myPlugin.create({ defaultValue: 'test' });
   */
  build(): PluginFactory<Data, Params, Outputs, Config> {
    return new PluginModelFactory<Data, Params, Outputs, Config>({
      name: this.name,
      data: this.data,
      outputs: this.outputs,
      featureFlags: this.featureFlags,
    });
  }
}
