---
"@platforma-sdk/model": minor
"@platforma-sdk/workflow-tengo": patch
"@platforma-sdk/ui-vue": patch
---

`buildDatasetOptions`: scope filter discovery to the result pool only (block outputs and prerun no longer pollute the filter dropdown), add a `filter` predicate to restrict eligible filter columns, and skip filter matches without a PlRef instead of throwing. Removes the need for callers to wrap `buildDatasetOptions` in try/catch.

`tableBuilder.addPrimary`: drop a `PrimaryRef.filter` whose `resolveColumn` produced no spec, so a stale or malformed filter ref no longer causes `pframes.build-table` to panic with `field "spec" not found and inputs locked`.

`PlDatasetSelector`: always render the filter dropdown, regardless of whether the selected dataset has compatible filters; the dropdown is clearable and uses an empty selection (instead of a synthetic "No filter" entry) to mean "no filter applied". Removed the `noFilterLabel` prop.
