---
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
---

Type-safe `usePlugin` composable with `PluginHandle` branded type.

**`@platforma-sdk/model`:**
- Added `PluginFactory` interface (public return type of `PluginModelBuilder.build()`)
- Added `PluginHandle<F>` branded type for type-safe plugin instance passing
- Added `InferPluginHandles` type helper
- Added `pluginIds` to `BlockModelInfo`

**`@platforma-sdk/ui-vue`:**
- Added `usePlugin(handle)` composable — reactive `model.data`, computed `model.outputs` and `model.outputErrors`, isolated per plugin
- Added `app.plugins` record mapping plugin IDs to typed `PluginHandle` values
- Filtered `plugin-output#` keys from block-level `outputs` and `outputErrors`
- Removed `usePluginData` (replaced by `usePlugin`)
