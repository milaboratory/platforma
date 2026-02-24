import { inject } from "vue";
import { pluginDataKey } from "./defineApp";
import type { PluginAccess } from "./internal/createAppV3";
import type { PluginHandle } from "@platforma-sdk/model";

/**
 * Composable for accessing a plugin's reactive model: data, outputs, and outputErrors.
 *
 * Mirrors the `app.model` access pattern — `plugin.model.data` is reactive and deep-watched,
 * mutations are automatically queued and sent to storage.
 *
 * @param handle - Opaque plugin handle obtained from `app.plugins`.
 * @typeParam F - The plugin factory type (inferred from the handle)
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { usePlugin, type InferPluginHandle } from '@platforma-sdk/ui-vue';
 * import type { CounterPlugin } from './plugins/counter';
 *
 * const props = defineProps<{ instance: InferPluginHandle<CounterPlugin> }>();
 * const plugin = usePlugin(props.instance);
 *
 * plugin.model.data.count += 1;          // reactive, triggers storage update
 * plugin.model.outputs.displayText       // computed, plugin's own outputs only
 * plugin.model.outputErrors.displayText  // Error | undefined
 * </script>
 * ```
 */
export function usePlugin<F>(handle: PluginHandle<F>) {
  const access = inject<PluginAccess>(pluginDataKey);

  if (!access) {
    throw new Error(
      "usePlugin requires a V3 block (BlockModelV3). " +
        "Make sure the block uses apiVersion 3 and the plugin is installed.",
    );
  }

  return access.getOrCreatePluginState<F>(handle);
}
