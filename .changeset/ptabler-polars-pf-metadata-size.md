---
"@platforma-open/milaboratories.software-ptabler": minor
"@platforma-sdk/workflow-tengo": minor
---

Bump ptabler to `polars-pf==1.1.40` and the python runenv to `1.10.0`, which add the `metadataSize` field to each part's `stats` in the `ParquetPartitioned` `.datainfo` output.

`pt/import-dir` now asserts `metadataSize` is present in the datainfo stats, so the workflow fails fast if the column data was produced by an older ptabler that does not emit it.
