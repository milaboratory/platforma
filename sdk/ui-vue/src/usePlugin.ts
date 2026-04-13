import { inject, type Reactive } from "vue";
import { pluginDataKey } from "./defineApp";
import type {
  PluginHandle,
  InferFactoryData,
  InferFactoryOutputs,
  InferFactoryUiServices,
  PluginFactoryLike,
} from "@platforma-sdk/model";

/** Per-plugin reactive model exposed to consumers via usePlugin(). */
export interface PluginState<
  Data = unknown,
  Outputs = unknown,
  Services = Record<string, unknown>,
> {
  readonly model: Reactive<{
    data: Data;
    outputs: Outputs extends Record<string, unknown>
      ? { [K in keyof Outputs]: Outputs[K] | undefined }
      : Record<string, unknown>;
    outputErrors: Outputs extends Record<string, unknown>
      ? { [K in keyof Outputs]?: Error }
      : Record<string, Error | undefined>;
  }>;
  readonly services: Services;
}

/** Internal interface for plugin access — provided via Vue injection to usePlugin(). */
export interface PluginAccess {
  getOrCreatePluginState<F extends PluginFactoryLike>(
    handle: PluginHandle<F>,
  ): PluginState<InferFactoryData<F>, InferFactoryOutputs<F>, InferFactoryUiServices<F>>;
}

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
export function usePlugin<F extends PluginFactoryLike>(handle: PluginHandle<F>) {
  const access = inject<PluginAccess>(pluginDataKey);

  if (!access) {
    throw new Error(
      "usePlugin requires a V3 block (BlockModelV3). " +
        "Make sure the block uses apiVersion 3 and the plugin is installed.",
    );
  }

  return access.getOrCreatePluginState<F>(handle);
}
