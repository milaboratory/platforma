---
"@platforma-sdk/test": minor
---

Recorded outputs: `recordColumns`, `writeRecording`/`readRecording`, `diffRecordings`, `expectRecording` (golden test of a run's exported columns; `UPDATE_RECORDINGS=1` rewrites) and `recordedDataset` (a recording as a publishable upstream fixture). One TSV over the union of axes with `parentAxes`; the producer's block id is tokenized; JSON annotations are canonicalized; an empty string records as NA.
