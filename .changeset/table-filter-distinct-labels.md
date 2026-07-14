---
"@platforma-sdk/ui-vue": patch
---

PlTableFiltersV2: derive column option labels with `deriveDistinctLabels`
(matching the table header) instead of the raw `Label` annotation. Columns that
share a base label but differ by trace — e.g. a multi-axis abundance column
split per sample — now show distinct labels ("Number Of Reads / <sample>") in
the filter picker instead of collapsing to identical entries. Axes are left
untouched (they are already unique).
