import type { PluginName } from "../../block_storage";
import { PluginDataModelBuilder, PluginModel } from "../../plugin_model";
import { computeDependencies, computeDependents } from "./compute";
import type { BlockDependenciesOutput, BlockDependentsOutput } from "./types";

/**
 * Reports how a block is tied to other blocks through column references in args:
 * - `dependencies` — outputs of other blocks this block's args reference;
 * - `dependents` — blocks whose args reference outputs of this block.
 *
 * Each reference is checked against what the last run of the producing block exports: whether
 * the column is there, and whether it holds the values picked from it. Runs that are only
 * prepared, not started, do not count. The plugin keeps no state of its own.
 */
export const blockDependenciesPlugin = PluginModel.define({
  name: "blockDependencies" as PluginName,
  data: new PluginDataModelBuilder().from<Record<string, never>, "v1">("v1").init(() => ({})),
})
  .output("dependencies", (ctx): BlockDependenciesOutput => computeDependencies(ctx))
  .output("dependents", (ctx): BlockDependentsOutput => computeDependents(ctx))
  .build();

/** {@link blockDependenciesPlugin} under the plugin id `dependencies`. */
export const blockDependencies = blockDependenciesPlugin.create({ pluginId: "dependencies" });
