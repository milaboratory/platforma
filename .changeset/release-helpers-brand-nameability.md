---
"@milaboratories/helpers": patch
---

Release the nameable string-key `Branded` fix. The brand key was changed from a
`unique symbol` to a plain string literal (`{ readonly __brand: B }`) in the new
column access work so branded types stay nameable during cross-package `.d.ts`
emit. That source change shipped in #1739, but `@milaboratories/helpers@1.14.3`
was published before it merged, so the fix never reached consumers.

Without this, any package that lets a `Branded`-based id (e.g. the
`ColumnUniversalId` union: `LocalPObjectId | GlobalPObjectId | ColumnFilteredId |
ColumnDiscoveredId | ColumnOverriddenId`) flow into an inferred exported type
fails declaration emit with TS4023 ("has or is using name '__brand' ... but
cannot be named"). Bumping helpers republishes the fix and cascades to
pl-model-common / model / ui-vue.
