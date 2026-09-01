---
"@platforma-sdk/ui-vue": minor
---

Replace zod with valibot in ui-vue

`ReactiveFileContent.getContentJson` now takes a Standard Schema v1 validator
instead of a zod schema. Blocks that pass their own zod schema keep working
without a change, because zod 3.25 and valibot 1.4 both implement that interface.
An asynchronous schema is rejected rather than awaited, since file content is read
synchronously.

`isZodError` and `formatZodError` become `isSchemaError` and `formatSchemaError`.
They match on the `issues` array rather than on a library type, so `createModel`
formats validation errors from either library. The message now lists every issue
with its path, in place of zod's `flatten()` grouping.
