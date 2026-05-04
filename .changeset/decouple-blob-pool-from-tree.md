---
"@milaboratories/pl-middle-layer": patch
---

Fix PFrame errors in duplicated projects when the original is recalculated. The blob pools deduplicated entries by rid but resolved through the first acquirer's `PlTreeEntry`; once that tree dropped the resource, other projects sharing the entry started failing with "resource not found in the tree" and parquet HTTP 500s. Snapshots are now captured at parse time and the pools resolve via the snapshot directly, keeping cross-project dedup intact.
