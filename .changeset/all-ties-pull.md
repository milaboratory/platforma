---
"@platforma-sdk/workflow-tengo": minor
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": patch
---

tableBuilder: setColumnJoin("left" | "full" | "inner") and a per-column join option control how columns added with addColumn / addColumns are joined onto the primaries. The default stays "full". Use "left" with a filtered primary so added columns don't bring back keys the filter removed.

buildDatasetOptions: new requireEnrichments option (default true). Set it to false for blocks that only need the dataset and its filters, so blocks that enrich the dataset no longer make them stale when they run.

PlDatasetSelector: a stored selection whose requireEnrichments flag differs from the options' is now shown instead of appearing empty.
