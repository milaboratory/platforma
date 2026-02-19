import { computed, inject } from "vue";
import { deepClone } from "@milaboratories/helpers";
import { pluginDataKey } from "./defineApp";
import type { PluginDataAccess } from "./internal/createAppV3";

/**
 * Composable for accessing and updating plugin-specific data.
 *
 * Plugin components are self-contained: they use this composable to read/write
 * their own data slice from BlockStorage without knowing about the parent block's data.
 *
 * Requires a V3 block (BlockModelV3). Throws if used in a V1/V2 block.
 *
 * @param pluginId - The plugin instance ID (must match the ID used in BlockModelV3.plugin()).
 *   Must be a static value; changing it after mount will not re-bind the composable.
 * @returns `{ data, updateData }` where `data` is a reactive ref to the plugin's data,
 *   and `updateData` returns a promise resolving to `true` if the mutation was sent,
 *   or `false` if data is not yet available.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * const { data, updateData } = usePluginData<CounterData>('counter');
 *
 * function increment() {
 *   updateData((d) => ({ ...d, count: d.count + 1 }));
 * }
 * </script>
 * ```
 */
export function usePluginData<Data>(pluginId: string) {
  const access = inject<PluginDataAccess>(pluginDataKey);

  if (!access) {
    throw new Error(
      "usePluginData requires a V3 block (BlockModelV3). " +
        "Make sure the block uses apiVersion 3 and the plugin is installed.",
    );
  }

  // Initialize the plugin data slot from snapshot if not already done
  access.initPluginDataSlot(pluginId);

  // Reactive reference to the plugin's data in the shared optimistic map
  const data = computed<Data | undefined>(() => {
    return access.pluginDataMap[pluginId] as Data | undefined;
  });

  /**
   * Update plugin data with optimistic feedback.
   *
   * @param cb - Callback that receives a deep clone of current data and returns new data.
   * @returns Promise that resolves to true when the mutation is sent
   */
  const updateData = (cb: (current: Data) => Data): Promise<boolean> => {
    const current = data.value;
    if (current === undefined) return Promise.resolve(false);
    const newValue = cb(deepClone(current));
    return access.setPluginData(pluginId, newValue);
  };

  return { data, updateData };
}
