---
"@platforma-sdk/model": minor
"@milaboratories/pl-middle-layer": minor
"@platforma-sdk/test": minor
---

**BREAKING:** The error schemas that `@platforma-sdk/model` re-exports from `@milaboratories/pl-error-like` (`ErrorLike`, `PlErrorLike`, `StandardErrorLike`, `BasePlErrorLike`) are now [Valibot](https://valibot.dev) schemas, not Zod schemas. `@milaboratories/pl-middle-layer` re-exports them too, and `@platforma-sdk/test` through `ML`. Their output types are unchanged, so code that only uses the types or calls `ensureErrorLike` needs no change. To parse one, add `valibot` (`^1.5.0`) to the block's dependencies and call `v.parse(ErrorLike, value)` instead of `ErrorLike.parse(value)`. A failed `parseErrorLikeSafe` returns a `ValiError` instead of a `ZodError`, and a block cannot compose these schemas into Zod schemas any more.
