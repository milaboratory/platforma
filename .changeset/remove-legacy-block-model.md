---
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
---

Remove everything that *created* the v1/v2 block format.

SDK-version backward compatibility is already broken, so nothing is left to serve.
`BlockModelV3` + `defineAppV3` are the only way to author a block now.

Removed from `@platforma-sdk/model`:

- `BlockModel` (the v1/v2 builder) and `RenderCtxLegacy` / `RenderFunctionLegacy`
- the `TypedConfig` builder DSL — `config/actions.ts` (`makeObject`, `getJsonField`,
  `mapArrayValues`, `getBlobContent*`, `Args`/`It`/`MainOutputs`, …) and the
  type-level machinery that existed only to type it (`actions_kinds.ts`,
  `type_util.ts`, `ConfigResult`, `ExtractAction`, the `TypedConfig` brand)
- `ref_util.ts` (`fromPlRef`, `fromPlOption`)
- `ResolveCfgType`, `InferOutputType`, `InferOutputsFromConfigs`

Removed from `@platforma-sdk/ui-vue`:

- `defineApp` (the v1/v2 entry point), `createAppV1`, `createAppV2`, `createAppModel`
- `AppV1`/`AppV2`/`SdkPluginV1`/`SdkPluginV2`; `SdkPlugin` is now `SdkPluginV3`
- the v1/v2 test helpers (`BlockMock`, `createMockApi`) and static tests

Reading the old format is untouched: `Cfg`, `PlResourceEntry`, `StdCtx`,
`downgradeCfgOrLambda`, the middle layer's `cfg_render` executor, `PlatformaV1` /
`PlatformaV2` / `BlockApiV1` / `BlockApiV2`, the `configVersion: 3` branch in
block-config normalization, `block_storage` schema version 1 and
`DataModel.upgradeLegacy()` all stay — the desktop app still runs blocks published
before this change, and existing projects still carry their state.
