/**
 * PluginHandle — Opaque branded handle for plugin instances.
 *
 * Extracted into its own module to break circular dependencies:
 * both block_storage.ts and plugin_model.ts can import from here
 * without depending on each other.
 *
 * @module plugin_handle
 */

import type { Branded } from "@milaboratories/helpers";

/**
 * Opaque handle for passing a plugin instance from block UI to a plugin component.
 * At runtime this is just the plugin instance ID string.
 *
 * Branded with the factory type `F` for type-safe access — the factory's `__types`
 * phantom field enables extracting Data, Outputs, etc. without importing PluginFactory.
 *
 * @typeParam F - The plugin factory type (carries type info via `__types` phantom)
 */
export type PluginHandle<F = unknown> = Branded<string, F>;

/**
 * Structural protocol for extracting types from a factory phantom.
 * Any type with a `__types` field matching this shape will work —
 * this avoids importing PluginFactory in modules that only need type extraction.
 */

/**
 * Normalized phantom type for plugin handle branding.
 * Carries Data, Params, Outputs without depending on PluginFactory.
 * Both InferPluginHandle and InferPluginHandles produce this same phantom,
 * ensuring handle types match regardless of how they were derived.
 */
export type PluginPhantom<Data = unknown, Params = unknown, Outputs = unknown> = {
  readonly __types?: { data: Data; params: Params; outputs: Outputs };
};

/** Extract the Data type from a factory-branded phantom. */
export type InferFactoryData<F> = F extends { readonly __types?: { data: infer D } } ? D : unknown;

/** Extract the Params type from a factory-branded phantom. */
export type InferFactoryParams<F> = F extends { readonly __types?: { params: infer P } }
  ? P
  : unknown;

/** Extract the Outputs type from a factory-branded phantom. */
export type InferFactoryOutputs<F> = F extends { readonly __types?: { outputs: infer O } }
  ? O
  : unknown;
