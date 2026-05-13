---
"@platforma-sdk/model": patch
"@platforma-sdk/ui-vue": patch
---

`PlDatasetSelector` filter rows used to render as the dataset's name (e.g.
"Bulk") instead of the producing block's name (e.g. "Top 10"). Root cause:
the parent dataset's trace ends with a high-importance
`samples-and-data/dataset` step ("Bulk", importance 100); with a single
filter `deriveDistinctLabels` had no peer to disambiguate against and
picked that step.

Fix: `filterMatchesToOptions` now includes the dataset spec as an extra
entry when calling `deriveDistinctLabels`, then discards its label. The
algorithm is forced to pick types that distinguish each filter from the
dataset, surfacing the filter-specific trace step. Filter labels carry the
dataset name as a prefix (e.g. "Bulk / Top 10"); `PlDatasetSelector` drops
the now-redundant dataset-name subtitle on filter rows.

Filter columns inherit the dataset's `pl7.app/label` annotation; the
filter-discovery code now suppresses native labels via
`formatters.native` so the algorithm reaches into the trace for
disambiguation.

`filterMatchesToOptions` signature: `(matches, options)` where
`FilterMatchOptions = { refsByObjectId, datasetSpec }`. The previous
trailing `labelOptions?` positional is removed — it had no real callers,
and the function's native-label suppression is load-bearing so accepting
arbitrary formatter overrides would risk regressing the fix.
