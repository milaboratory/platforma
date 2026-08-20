---
"@platforma-sdk/model": minor
---

Remove the legacy `BlockModel` (v1/v2) builder.

SDK-version backward compatibility is already broken, so the legacy model has no
consumers left to serve. Deleted:

- `BlockModel` class and everything it exported from `block_model_legacy.ts`
- `RenderCtxLegacy` and `RenderFunctionLegacy` from `render/api.ts`

`BlockModelV3` is the only block model builder now. The `TypedConfig` config path
itself stays — `BlockModelV3` still emits it via `downgradeCfgOrLambda` for older
desktop versions.
