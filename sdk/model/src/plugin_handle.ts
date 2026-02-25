/**
 * PluginHandle — Opaque branded handle and output key utilities for plugin instances.
 *
 * Extracted into its own module to break circular dependencies:
 * both block_storage.ts and plugin_model.ts can import from here
 * without depending on each other.
 *
 * @module plugin_handle
 */

import type { Branded } from "@milaboratories/helpers";

/**
 * Phantom-only base type for constraining PluginHandle's type parameter.
 *
 * PluginFactory has create() → PluginModel with function properties, making it invariant
 * under strictFunctionTypes. PluginFactoryLike exposes only the covariant `__types` phantom,
 * avoiding the contravariance chain. Handles only need `__types` for type extraction.
 *
 * PluginFactory extends PluginFactoryLike, so every concrete factory satisfies this constraint.
 */
export interface PluginFactoryLike<
  Data extends Record<string, unknown> = Record<string, unknown>,
  Params extends undefined | Record<string, unknown> = undefined | Record<string, unknown>,
  Outputs extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly __types?: {
    data: Data;
    params: Params;
    outputs: Outputs;
  };
}

/** Extract the Data type from a PluginFactoryLike phantom. */
export type InferFactoryData<F extends PluginFactoryLike> =
  NonNullable<F["__types"]> extends { data: infer D } ? D : Record<string, unknown>;

/** Extract the Params type from a PluginFactoryLike phantom. */
export type InferFactoryParams<F extends PluginFactoryLike> =
  NonNullable<F["__types"]> extends { params: infer P } ? P : undefined;

/** Extract the Outputs type from a PluginFactoryLike phantom. */
export type InferFactoryOutputs<F extends PluginFactoryLike> =
  NonNullable<F["__types"]> extends { outputs: infer O } ? O : Record<string, unknown>;

/**
 * Derive a typed PluginHandle from a PluginFactory type.
 * Normalizes the brand to only data/params/outputs (strips config) so handles
 * from InferPluginHandles match handles from InferPluginHandle.
 */
export type InferPluginHandle<F extends PluginFactoryLike> =
  NonNullable<F["__types"]> extends {
    data: infer Data extends Record<string, unknown>;
    params: infer Params extends undefined | Record<string, unknown>;
    outputs: infer Outputs extends Record<string, unknown>;
  }
    ? PluginHandle<PluginFactoryLike<Data, Params, Outputs>>
    : PluginHandle;

/**
 * Opaque handle for a plugin instance. Runtime value is the plugin instance ID string.
 * Branded with factory phantom `F` for type-safe data/outputs extraction.
 * Constrained with PluginFactoryLike (not PluginFactory) to avoid variance issues.
 */
export type PluginHandle<F extends PluginFactoryLike = PluginFactoryLike> = Branded<string, F>;

const PLUGIN_OUTPUT_PREFIX = "plugin-output#";

/** Construct the output key for a plugin output in the block outputs map. */
export function pluginOutputKey<F extends PluginFactoryLike>(
  handle: PluginHandle<F>,
  outputKey: string,
): string {
  return `${PLUGIN_OUTPUT_PREFIX}${handle}#${outputKey}`;
}

/** Check whether an output key belongs to a plugin (vs block-level output). */
export function isPluginOutputKey(key: string): boolean {
  return key.startsWith(PLUGIN_OUTPUT_PREFIX);
}

/** Get the prefix used for all outputs of a specific plugin instance. */
export function pluginOutputPrefix<F extends PluginFactoryLike>(handle: PluginHandle<F>): string {
  return pluginOutputKey(handle, "");
}
