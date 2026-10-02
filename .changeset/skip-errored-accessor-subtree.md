---
"@milaboratories/pl-model-common": patch
"@platforma-sdk/model": patch
---

Skip a field that has an error and no value when `indexAccessorRoot` walks a block output, and when a column spec is read. The traversal steps set `pureFieldErrorToUndefined`, which the host already supports. One failed export, for example an OOM in one step, no longer fails `ColumnsCollection` for the whole block.
