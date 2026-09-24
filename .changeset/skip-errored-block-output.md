---
"@platforma-sdk/model": patch
"@milaboratories/pl-middle-layer": patch
---

`getAccessorHandleByName` accepts `{ pureFieldErrorToUndefined: true }` and then returns `undefined` for a block output field that has an error and no value. Column sources (`getCtxProviders`, the `"current_block"` source of `ColumnsCollection`) use it, so an errored staging output no longer fails reads from the result pool or the main output. `ctx.outputs` and `ctx.prerun` still throw the output's error. An older desktop ignores the option and keeps the previous behaviour.
