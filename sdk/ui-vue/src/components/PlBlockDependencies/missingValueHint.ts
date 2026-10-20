import type { MissingValueHint } from "@milaboratories/uikit";
import type {
  BlockDependenciesOutput,
  blockDependenciesPlugin,
  InferPluginHandle,
} from "@platforma-sdk/model";
import { blockDependencies } from "@platforma-sdk/model";
import { h, inject } from "vue";
import type { PluginAccess } from "../../composition/usePlugin";
import { pluginDataKey, useSdkPlugin } from "../../defineApp";
import { PlBlockName } from "../PlBlockName";
import { describeMissingValue } from "./utils";

/**
 * The hint explaining a missing column value by the {@link blockDependencies} plugin of the
 * block; `undefined` outside a block, or when the block does not have the plugin. Called from
 * `setup`.
 */
export function useBlockDependenciesHint(): MissingValueHint | undefined {
  const access = inject<PluginAccess | undefined>(pluginDataKey, undefined);
  if (access === undefined) return undefined;
  const handle = dependenciesHandle(Object.keys(useSdkPlugin().useApp().plugins));
  if (handle === undefined) return undefined;
  const plugin = access.getOrCreatePluginState(handle);
  return missingValueHint(() => {
    const output = plugin.model.outputs.dependencies;
    return output !== undefined && output.ok ? output.value : undefined;
  });
}

/**
 * Explains a missing column value by the dependencies `readDependencies` gives: the block meant
 * to provide it, as a link to that block, and what went wrong.
 */
export function missingValueHint(
  readDependencies: () => BlockDependenciesOutput | undefined,
): MissingValueHint {
  return (value) => {
    const dependencies = readDependencies();
    if (dependencies === undefined) return undefined;
    const cause = describeMissingValue(dependencies, value);
    if (cause === undefined) return undefined;
    return () =>
      h("span", [
        h(PlBlockName, { blockId: cause.blockId, name: cause.blockName }),
        ` ${cause.text}`,
      ]);
  };
}

// Internals

function dependenciesHandle(
  pluginIds: readonly string[],
): InferPluginHandle<typeof blockDependenciesPlugin> | undefined {
  return pluginIds.includes(blockDependencies.id)
    ? (blockDependencies.id as InferPluginHandle<typeof blockDependenciesPlugin>)
    : undefined;
}
