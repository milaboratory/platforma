---
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
---

Type-safe `usePlugin` composable with `PluginHandle` branded type.

**`@platforma-sdk/model`:**
- Added `PluginFactory` interface (public return type of `PluginModelBuilder.build()`)
- Added `PluginHandle<F>` branded type using `Branded` from `@milaboratories/helpers`
- Added `InferPluginHandles` type helper
- Added `pluginIds` to `BlockModelInfo`
- Added `pluginOutputKey`, `isPluginOutputKey`, `pluginOutputPrefix` helpers

**`@platforma-sdk/ui-vue`:**
- Added `usePlugin(handle)` composable — reactive `model.data`, computed `model.outputs` and `model.outputErrors`, isolated per plugin
- Added `app.plugins` record mapping plugin IDs to typed `PluginHandle` values
- Renamed `PluginSlot` to `PluginState<Data, Outputs>` (generic, avoids Vue naming conflict)
- Filtered plugin output keys from block-level `outputs` and `outputErrors` via helpers
- Removed `usePluginData` (replaced by `usePlugin`)
