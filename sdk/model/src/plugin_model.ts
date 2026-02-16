/**
 * PluginModel - Builder for creating plugin types with data model and outputs.
 *
 * Plugins are UI components with their own model logic and persistent state.
 * Block developers register plugin instances via BlockModelV3.plugin() method.
 *
 * @module plugin_model
 */

import type { DataModel } from "./block_migrations";
import type { ResultPool } from "./render";

/** Symbol for internal builder creation method */
const FROM_BUILDER = Symbol("fromBuilder");

// =============================================================================
// Plugin Render Context
// =============================================================================

/**
 * Context passed to plugin output functions.
 * Provides access to plugin's persistent data, params derived from block context,
 * and the result pool for accessing workflow outputs.
 */
export interface PluginRenderCtx<Data, Params = undefined> {
  /** Plugin's persistent data */
  readonly data: Data;
  /** Params derived from block's RenderCtx */
  readonly params: Params;
  /** Result pool for accessing workflow outputs */
  readonly resultPool: ResultPool;
}

// =============================================================================
// Plugin Type
// =============================================================================

/**
 * Configured plugin instance returned by PluginModelFactory.create().
 * Contains the plugin's name, data model, and output definitions.
 */
export class PluginModel<Data = unknown, Params = undefined, Outputs = {}> {
  /** Globally unique plugin name */
  readonly name: string;
  /** Data model instance for this plugin */
  readonly dataModel: DataModel<Data>;
  /** Output definitions - functions that compute outputs from plugin context */
  readonly outputs: { [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K] };

  private constructor(input: {
    name: string;
    dataModel: DataModel<Data>;
    outputs: { [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K] };
  }) {
    this.name = input.name;
    this.dataModel = input.dataModel;
    this.outputs = input.outputs;
  }

  /**
   * Internal method for creating PluginModel from factory.
   * Uses Symbol key to prevent external access.
   * @internal
   */
  static [FROM_BUILDER]<D, P, O>(input: {
    name: string;
    dataModel: DataModel<D>;
    outputs: { [K in keyof O]: (ctx: PluginRenderCtx<D, P>) => O[K] };
  }): PluginModel<D, P, O> {
    return new this<D, P, O>(input);
  }

  /**
   * Creates a new PluginModelBuilder for building plugin definitions.
   *
   * @param options.name - Globally unique plugin name
   * @param options.dataModelFactory - Factory function that creates the data model from config
   * @returns PluginModelBuilder for chaining output definitions
   *
   * @example
   * const dataModelChain = new DataModelBuilder<VersionedData>().from(Version.V1);
   *
   * const myPlugin = PluginModel.create<MyData, MyParams, MyConfig>({
   *   name: 'myPlugin',
   *   dataModelFactory: (cfg) => dataModelChain.init(() => ({ value: cfg.defaultValue })),
   * })
   *   .output('computed', (ctx) => ctx.data.value * ctx.params.multiplier)
   *   .build();
   */
  static create<Data, Params = undefined, Config = undefined>(options: {
    name: string;
    dataModelFactory: (config?: Config) => DataModel<Data>;
  }): PluginModelBuilder<Data, Params, Config> {
    return PluginModelBuilder[FROM_BUILDER]<Data, Params, Config>(options);
  }
}

/**
 * Plugin factory returned by PluginModelBuilder.build().
 * Call create() with config to get a configured PluginModel instance.
 */
class PluginModelFactory<Data, Params, Config, Outputs> {
  private readonly name: string;
  private readonly dataModelFactory: (config?: Config) => DataModel<Data>;
  private readonly outputs: {
    [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K];
  };

  constructor(input: {
    name: string;
    dataModelFactory: (config?: Config) => DataModel<Data>;
    outputs: { [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K] };
  }) {
    this.name = input.name;
    this.dataModelFactory = input.dataModelFactory;
    this.outputs = input.outputs;
  }

  /** Create a configured PluginModel instance */
  create(config?: Config): PluginModel<Data, Params, Outputs> {
    return PluginModel[FROM_BUILDER]<Data, Params, Outputs>({
      name: this.name,
      dataModel: this.dataModelFactory(config),
      outputs: this.outputs,
    });
  }
}

// =============================================================================
// Plugin Model Builder
// =============================================================================

/**
 * Builder for creating PluginType with type-safe output definitions.
 *
 * Use `PluginModel.create()` to create a builder instance.
 *
 * @typeParam Data - Plugin's persistent data type
 * @typeParam Params - Params derived from block's RenderCtx (optional)
 * @typeParam Config - Static configuration passed to plugin factory (optional)
 * @typeParam Outputs - Accumulated output types
 *
 * @example
 * const dataModelChain = new DataModelBuilder<VersionedData>().from(Version.V1);
 *
 * const dataTable = PluginModel.create<TableData, TableParams, TableConfig>({
 *     name: 'dataTable',
 *     dataModelFactory: (cfg) => {
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
  private readonly name: string;
  private readonly dataModelFactory: (config?: Config) => DataModel<Data>;
  private readonly outputs: {
    [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K];
  };

  private constructor(input: {
    name: string;
    dataModelFactory: (config?: Config) => DataModel<Data>;
    outputs?: { [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K] };
  }) {
    this.name = input.name;
    this.dataModelFactory = input.dataModelFactory;
    this.outputs =
      input.outputs ??
      ({} as { [K in keyof Outputs]: (ctx: PluginRenderCtx<Data, Params>) => Outputs[K] });
  }

  /**
   * Internal method for creating PluginModelBuilder.
   * Uses Symbol key to prevent external access.
   * @internal
   */
  static [FROM_BUILDER]<D, P, C, O extends Record<string, unknown> = {}>(input: {
    name: string;
    dataModelFactory: (config?: C) => DataModel<D>;
    outputs?: { [K in keyof O]: (ctx: PluginRenderCtx<D, P>) => O[K] };
  }): PluginModelBuilder<D, P, C, O> {
    return new this<D, P, C, O>(input);
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
      dataModelFactory: this.dataModelFactory,
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
  build(): PluginModelFactory<Data, Params, Config, Outputs> {
    return new PluginModelFactory<Data, Params, Config, Outputs>({
      name: this.name,
      dataModelFactory: this.dataModelFactory,
      outputs: this.outputs,
    });
  }
}
