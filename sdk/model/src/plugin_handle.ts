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
import type { PluginFactory } from "./plugin_model";

/**
 * Opaque handle for passing a plugin instance from block UI to a plugin component.
 * At runtime this is just the plugin instance ID string.
 *
 * Branded with the factory type `F` for type-safe access — the factory's `__types`
 * phantom field enables extracting Data, Outputs, etc. without importing PluginFactory.
 *
 * @typeParam F - The plugin factory type (carries type info via `__types` phantom)
 */
export type PluginHandle<F extends PluginFactory = PluginFactory> = Branded<string, F>;

/** Extract the Data type from a factory-branded phantom. */
export type InferFactoryData<F> = F extends PluginFactory<infer D> ? D : unknown;

/** Extract the Params type from a factory-branded phantom. */
export type InferFactoryParams<F> = F extends PluginFactory<any, infer P> ? P : unknown;

/** Extract the Outputs type from a factory-branded phantom. */
export type InferFactoryOutputs<F> = F extends PluginFactory<any, any, infer O> ? O : unknown;

// =============================================================================
// Plugin output key conventions
// =============================================================================

const PLUGIN_OUTPUT_PREFIX = "plugin-output#";

/** Construct the output key for a plugin output in the block outputs map. */
export function pluginOutputKey<F extends PluginFactory>(
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
export function pluginOutputPrefix<F extends PluginFactory>(handle: PluginHandle<F>): string {
  return pluginOutputKey(handle, "");
}
