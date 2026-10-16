---
"@platforma-sdk/test": minor
---

Recorded outputs: `expectRecording` (golden test of a run's exported columns as file snapshots of `manifest.json` + `data.tsv`; `vitest -u` rewrites) and `recordedDataset` (a recording as a publishable upstream fixture). One TSV over the union of axes with `parentAxes`; the producer's block id is tokenized; specs and JSON annotations are canonicalized; an empty cell is NA.
