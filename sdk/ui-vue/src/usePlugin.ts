import { inject } from "vue";
import { pluginDataKey } from "./defineApp";
import type { PluginAccess } from "./internal/createAppV3";
import type { PluginModel, PluginHandle } from "@platforma-sdk/model";

type InferFactoryData<F> = F extends { create(...args: any[]): PluginModel<infer D, any, any> }
  ? D
  : never;

type InferFactoryOutputs<F> = F extends { create(...args: any[]): PluginModel<any, any, infer O> }
  ? O
  : never;

/**
 * Composable for accessing a plugin's reactive model: data, outputs, and outputErrors.
 *
 * Mirrors the `app.model` access pattern — `plugin.model.data` is reactive and deep-watched,
 * mutations are automatically queued and sent to storage.
 *
 * @param handle - Opaque plugin handle obtained from `app.plugins`.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { usePlugin, type PluginHandle } from '@platforma-sdk/ui-vue';
 * import type { CounterPluginFactory } from './plugins/counter';
 *
 * const props = defineProps<{ instance: PluginHandle<CounterPluginFactory> }>();
 * const plugin = usePlugin(props.instance);
 *
 * plugin.model.data.count += 1;          // reactive, triggers storage update
 * plugin.model.outputs.displayText       // computed, plugin's own outputs only
 * plugin.model.outputErrors.displayText  // Error | undefined
 * </script>
 * ```
 */
export function usePlugin<F>(handle: PluginHandle<F>): {
  model: {
    data: InferFactoryData<F>;
    outputs: { [K in keyof InferFactoryOutputs<F>]: InferFactoryOutputs<F>[K] | undefined };
    outputErrors: { [K in keyof InferFactoryOutputs<F>]?: Error };
  };
} {
  const access = inject<PluginAccess>(pluginDataKey);

  if (!access) {
    throw new Error(
      "usePlugin requires a V3 block (BlockModelV3). " +
        "Make sure the block uses apiVersion 3 and the plugin is installed.",
    );
  }

  const slot = access.getOrCreatePluginSlot(handle);

  return { model: slot.model } as any;
}
