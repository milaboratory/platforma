---
"@milaboratories/pl-tree": patch
"@milaboratories/pl-middle-layer": patch
"@milaboratories/pl-model-common": patch
"@platforma-sdk/model": patch
---

A field's error can be read without traversing the field. `PlTreeNodeAccessor.getFieldError(field)` and `TreeNodeAccessor.getFieldError(field)` return the error attached to a field, whether or not the field also has a value; the render ctx gets `getFieldError(handle, field)`. On an older desktop, which lacks that method, `TreeNodeAccessor.getFieldError` reports the error a traversal of the field throws, so only a field with an error and no value is seen. `readColumnField(accessor, field)` in `pl-model-common` reads a column field as `present`, `resolving`, `absent` or `errored`.
