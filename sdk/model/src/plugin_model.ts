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
import type { PluginHandle, PluginPhantom } from "./plugin_handle";
import type { PluginRenderCtx } from "./render";

const PLUGIN_OUTPUT_PREFIX = "plugin-output#";

/** Construct the output key for a plugin output in the block outputs map. */
export function pluginOutputKey(handle: PluginHandle, outputKey: string): string {
  return `${PLUGIN_OUTPUT_PREFIX}${handle}#${outputKey}`;
}

/** Check whether an output key belongs to a plugin (vs block-level output). */
export function isPluginOutputKey(key: string): boolean {
  return key.startsWith(PLUGIN_OUTPUT_PREFIX);
}

/** Get the prefix used for all outputs of a specific plugin instance. */
export function pluginOutputPrefix(handle: PluginHandle): string {
  return pluginOutputKey(handle, "");
}

/** Symbol for internal builder creation method */
const FROM_BUILDER = Symbol("fromBuilder");

/**
 * Configured plugin instance returned by PluginModelFactory.create().
 * Contains the plugin's name, data model, and output definitions.
 */
export class PluginModel<Data = unknown, Params = undefined, Outputs = {}> {
  /** Globally unique plugin name */
  readonly name: PluginName;
  /** Data model instance for this plugin */
  readonly dataModel: DataModel<Data>;
  /** Output definitions - functions that compute outputs from plugin context */
  readonly outputs: { [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K] };
  /** Feature flags declared by this plugin */
  readonly featureFlags?: BlockCodeKnownFeatureFlags;

  private constructor(options: {
    name: PluginName;
    dataModel: DataModel<Data>;
    outputs: { [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K] };
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
  static [FROM_BUILDER]<D, P, O>(options: {
    name: PluginName;
    dataModel: DataModel<D>;
    outputs: { [K in keyof O]: (ctx: PluginRenderCtx<D, P>) => O[K] };
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModel<D, P, O> {
    return new this<D, P, O>(options);
  }

  /**
   * Creates a new PluginModelBuilder for building plugin definitions.
   *
   * @param options.name - Globally unique plugin name
   * @param options.data - Factory function that creates the data model from config
   * @returns PluginModelBuilder for chaining output definitions
   *
   * @example
   * const dataModelChain = new DataModelBuilder().from<MyData>(DATA_MODEL_DEFAULT_VERSION);
   *
   * const myPlugin = PluginModel.define<MyData, MyParams, MyConfig>({
   *   name: 'myPlugin' as PluginName,
   *   data: (cfg) => dataModelChain.init(() => ({ value: cfg.defaultValue })),
   * })
   *   .output('computed', (ctx) => ctx.data.value * ctx.params.multiplier)
   *   .build();
   */
  static define<Data, Params = undefined, Config = undefined>(options: {
    name: PluginName;
    data: (config?: Config) => DataModel<Data>;
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModelBuilder<Data, Params, Config> {
    return PluginModelBuilder[FROM_BUILDER]<Data, Params, Config>(options);
  }
}

/** Plugin factory returned by PluginModelBuilder.build(). */
export interface PluginFactory<
  Data = unknown,
  Params = undefined,
  Outputs = {},
  Config = undefined,
> {
  create(config?: Config): PluginModel<Data, Params, Outputs>;
  /**
   * @internal Phantom field for structural type extraction.
   * Enables InferFactoryData/InferFactoryOutputs to work without importing PluginFactory.
   */
  readonly __types?: { data: Data; params: Params; outputs: Outputs; config: Config };
}

/** Derive a typed PluginHandle from a PluginFactory type. */
export type InferPluginHandle<F> =
  F extends { readonly __types?: { data: infer D; params: infer Pm; outputs: infer O } }
    ? PluginHandle<PluginPhantom<D, Pm, O>>
    : never;


class PluginModelFactory<Data, Params, Config, Outputs> implements PluginFactory<
  Data,
  Params,
  Outputs,
  Config
> {
  private readonly name: PluginName;
  private readonly data: (config?: Config) => DataModel<Data>;
  private readonly outputs: {
    [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K];
  };
  private readonly featureFlags?: BlockCodeKnownFeatureFlags;

  constructor(options: {
    name: PluginName;
    data: (config?: Config) => DataModel<Data>;
    outputs: { [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K] };
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
 * const dataModelChain = new DataModelBuilder().from<TableData>(DATA_MODEL_DEFAULT_VERSION);
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
  Data,
  Params = undefined,
  Config = undefined,
  Outputs extends Record<string, unknown> = {},
> {
  private readonly name: PluginName;
  private readonly data: (config?: Config) => DataModel<Data>;
  private readonly outputs: {
    [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K];
  };
  private readonly featureFlags?: BlockCodeKnownFeatureFlags;

  private constructor(options: {
    name: PluginName;
    data: (config?: Config) => DataModel<Data>;
    outputs?: { [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K] };
    featureFlags?: BlockCodeKnownFeatureFlags;
  }) {
    this.name = options.name;
    this.data = options.data;
    this.outputs =
      options.outputs ??
      ({} as { [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K] });
    this.featureFlags = options.featureFlags;
  }

  /**
   * Internal method for creating PluginModelBuilder.
   * Uses Symbol key to prevent external access.
   * @internal
   */
  static [FROM_BUILDER]<D, P, C, O extends Record<string, unknown> = {}>(options: {
    name: PluginName;
    data: (config?: C) => DataModel<D>;
    outputs?: { [K in keyof O]: (ctx: PluginRenderCtx<D, P>) => O[K] };
    featureFlags?: BlockCodeKnownFeatureFlags;
  }): PluginModelBuilder<D, P, C, O> {
    return new this<D, P, C, O>(options);
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
    fn: (ctx: PluginRenderCtx<Data, Params>) => T,
  ): PluginModelBuilder<Data, Params, Config, Outputs & { [K in Key]: T }> {
    return new PluginModelBuilder<Data, Params, Config, Outputs & { [K in Key]: T }>({
      name: this.name,
      data: this.data,
      featureFlags: this.featureFlags,
      outputs: {
        ...this.outputs,
        [key]: fn,
      } as {
        [K in keyof (Outputs & { [P in Key]: T })]: (
          ctx: PluginRenderCtx<Data, Params>,
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
    return new PluginModelFactory<Data, Params, Config, Outputs>({
      name: this.name,
      data: this.data,
      outputs: this.outputs,
      featureFlags: this.featureFlags,
    });
  }
}
