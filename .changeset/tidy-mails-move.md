---
'@platforma-sdk/workflow-tengo-tests': minor
---

Breaking Changes:
type `ValueOrErrors` now has `ErrorLike` errors instead of `string` errors.
Several places that handles errors from block outputs, fields (when we use `resolve` in model), or in the result pool could be broken.

Migration steps:

- if your model handles errors (e.g. via try/catch) in the result pool, in outputs or in `resolve`, then your block will stop compiling. The type of errors was changed from `string` to `ErrorLike`, to get the error as string, get `.message` or `.fullMessage` attribute on the new error.
