---
"@milaboratories/pl-error-like": minor
---

**BREAKING:** The exported schemas `ErrorLike`, `PlErrorLike`, `StandardErrorLike` and `BasePlErrorLike` are now [Valibot](https://valibot.dev) schemas, not Zod schemas. Parse with `v.parse(ErrorLike, value)` instead of `ErrorLike.parse(value)`. The output types, `ensureErrorLike` and `parseErrorLikeSafe` are unchanged; on failure `parseErrorLikeSafe` returns a `ValiError` instead of a `ZodError`.
